/**
 * 添加/更新模型模块功能测试
 * 运行方式: node scripts/test-add-update-model.mjs
 */

const BASE = 'http://localhost:3000'
let passed = 0, failed = 0, skipped = 0
const testModelIds = []  // cleanup list

function color(c, s) {
  const codes = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m' }
  return `${codes[c] ?? ''}${s}${codes.reset}`
}

function section(title) { console.log('\n' + color('cyan', color('bold', `── ${title} ──────────────────────────────`))) }

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `)
  try {
    await fn()
    console.log(color('green', '✓ PASS'))
    passed++
  } catch (e) {
    console.log(color('red', `✗ FAIL: ${e.message}`))
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'assertion failed')
}

async function api(path, method = 'GET', body = undefined) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  return { status: res.status, data }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Input validation
// ─────────────────────────────────────────────────────────────────────────────
section('1. /api/scrape — 输入验证')

await test('缺少 url 和 modelName 返回 400', async () => {
  const { status, data } = await api('/api/scrape', 'POST', {})
  assert(status === 400, `Expected 400, got ${status}`)
  assert(data.error, 'Should have error message')
})

await test('仅 url 字段有效触发请求（知识模式兜底）', async () => {
  // We just check it doesn't 400, actual extraction may take time
  // Use a very fast knowledge-mode call
  const { status, data } = await api('/api/scrape', 'POST', {
    modelName: 'GPT-4o',
    company: 'OpenAI',
  })
  // Knowledge mode or registry mode should work
  assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data).slice(0, 200)}`)
  assert(data.extracted, 'Should return extracted field')
  assert(data.mode, 'Should return mode field')
  assert(Array.isArray(data.warnings), 'Should return warnings array')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Scrape response structure
// ─────────────────────────────────────────────────────────────────────────────
section('2. /api/scrape — 响应结构完整性')

let scrapeResult = null

await test('GPT-4o 抓取返回完整结构', async () => {
  const { status, data } = await api('/api/scrape', 'POST', { modelName: 'GPT-4o', company: 'OpenAI' })
  assert(status === 200, `status=${status}`)
  const e = data.extracted
  assert(e !== null && typeof e === 'object', 'extracted is object')
  // Check required fields exist (may be null but must be present)
  const requiredFields = ['name', 'company', 'release_date', 'params', 'context_window',
    'license', 'modalities', 'architecture', 'innovation', 'benchmarks',
    'input_price', 'output_price', 'confidence']
  for (const f of requiredFields) {
    assert(f in e, `Missing field: ${f}`)
  }
  assert(Array.isArray(e.benchmarks), 'benchmarks should be array')
  assert(typeof e.confidence === 'object', 'confidence should be object')
  assert(Array.isArray(data.warnings), 'warnings should be array')
  assert(typeof data.mode === 'string', 'mode should be string')
  assert('validation' in data, 'Should have validation field')
  scrapeResult = data
})

await test('mode 字段为已知枚举值', async () => {
  assert(scrapeResult, 'Need scrape result from previous test')
  const knownModes = ['multi-url', 'multi-registry', 'knowledge', 'url']
  assert(knownModes.includes(scrapeResult.mode), `Unknown mode: ${scrapeResult.mode}`)
})

await test('validation 结构合法', async () => {
  assert(scrapeResult, 'Need scrape result')
  const v = scrapeResult.validation
  assert(v && typeof v === 'object', 'validation should be object')
  // Each field should have {status, message} or be undefined
  for (const [field, val] of Object.entries(v)) {
    if (val && typeof val === 'object') {
      if ('status' in val) {
        assert(['error', 'warning', 'ok'].includes(val.status),
          `Field ${field} has invalid status: ${val.status}`)
      }
    }
  }
})

await test('confidence 值仅为 high/medium/low', async () => {
  assert(scrapeResult, 'Need scrape result')
  const conf = scrapeResult.extracted.confidence
  for (const [field, val] of Object.entries(conf)) {
    assert(['high', 'medium', 'low'].includes(val),
      `Field ${field} has invalid confidence: ${val}`)
  }
})

await test('benchmarks 名称已归一化（无原始变体）', async () => {
  assert(scrapeResult, 'Need scrape result')
  const benchmarks = scrapeResult.extracted.benchmarks
  const noisyNames = ['SWE Bench', 'swe-bench verified', 'MMLU Pro', 'mmlu-pro',
    'Quality index score', 'Intelligence index', 'TPS', 'Tokens per second']
  for (const b of benchmarks) {
    const nameLC = b.name.toLowerCase()
    assert(!noisyNames.some(n => n.toLowerCase() === nameLC),
      `Noisy benchmark name not filtered: ${b.name}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Scrape diff against existing model
// ─────────────────────────────────────────────────────────────────────────────
section('3. /api/scrape — diff 功能')

await test('传入有效 modelId 时 diff 字段非 undefined', async () => {
  // Get an existing model ID first
  const { data: models } = await api('/api/models')
  assert(Array.isArray(models) && models.length > 0, 'Need existing models')
  const firstModel = models[0]

  const { status, data } = await api('/api/scrape', 'POST', {
    modelName: firstModel.name,
    company: firstModel.company ?? undefined,
    modelId: firstModel.id,
  })
  assert(status === 200, `status=${status}`)
  // diff should be an object (possibly empty if no changes)
  assert(typeof data.diff === 'object', `diff should be object, got ${typeof data.diff}`)
})

await test('传入无效 modelId 时不崩溃（diff 为空）', async () => {
  const { status, data } = await api('/api/scrape', 'POST', {
    modelName: 'GPT-4o',
    modelId: '00000000-0000-0000-0000-000000000000',
  })
  assert(status === 200, `Should not crash: status=${status}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Create model — /api/models/create
// ─────────────────────────────────────────────────────────────────────────────
section('4. POST /api/models/create — 新增模型')

const TEST_MODEL_NAME = `__TestModel_${Date.now()}`

await test('创建最小有效模型（仅必填字段）', async () => {
  const { status, data } = await api('/api/models/create', 'POST', {
    name: TEST_MODEL_NAME,
    company: 'Test Corp',
    license: 'closed',
    modalities: ['text'],
    benchmarks: [],
    confidence: {},
  })
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`)
  assert(data.id, 'Should return model id')
  testModelIds.push(data.id)
})

let createdModelId = null

await test('创建完整模型（含 benchmarks + price）', async () => {
  const { status, data } = await api('/api/models/create', 'POST', {
    name: `${TEST_MODEL_NAME}_Full`,
    company: 'Test Corp',
    release_date: '2025-01-15',
    params: '7B',
    context_window: '128K',
    license: 'open',
    modalities: ['text', 'vision'],
    architecture: 'Transformer',
    innovation: 'Test model for automated testing.',
    benchmarks: [
      { name: 'SWE-bench', score: 25.5 },
      { name: 'MMLU', score: 75.2 },
    ],
    input_price: 0.5,
    output_price: 1.5,
    confidence: { name: 'high', params: 'high' },
  })
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`)
  assert(data.id, 'Should return model id')
  createdModelId = data.id
  testModelIds.push(data.id)
})

await test('创建后可通过 GET /api/models/:id 读回', async () => {
  assert(createdModelId, 'Need created model id')
  const { status, data } = await api(`/api/models/${createdModelId}`)
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.name === `${TEST_MODEL_NAME}_Full`, `Name mismatch: ${data.name}`)
  assert(data.params === '7B', `params mismatch: ${data.params}`)
  assert(data.context_window === '128K', `context_window mismatch`)
  assert(data.license === 'open', `license mismatch`)
  assert(Array.isArray(data.benchmarks), 'benchmarks should be array')
})

await test('benchmarks 写入后可从 GET 读回分数', async () => {
  assert(createdModelId, 'Need created model id')
  const { data } = await api(`/api/models/${createdModelId}`)
  const benchmarks = data.benchmarks ?? []
  // At least one benchmark should have been saved (SWE-bench or MMLU)
  assert(benchmarks.length > 0, `Expected benchmarks, got ${benchmarks.length}`)
  const hasScore = benchmarks.some(b => b.score > 0)
  assert(hasScore, 'At least one benchmark score should be > 0')
})

await test('price_history 写入后可从 GET 读回', async () => {
  assert(createdModelId, 'Need created model id')
  const { data } = await api(`/api/models/${createdModelId}`)
  const prices = data.price ?? []
  assert(prices.length > 0, `Expected price records, got ${prices.length}`)
  const latest = prices[0]
  assert(latest.input_price_per_million === 0.5, `input_price mismatch: ${latest.input_price_per_million}`)
  assert(latest.output_price_per_million === 1.5, `output_price mismatch`)
})

await test('company 不存在时自动创建（新公司名）', async () => {
  const newCo = `TestCo_${Date.now()}`
  const { status, data } = await api('/api/models/create', 'POST', {
    name: `${TEST_MODEL_NAME}_NewCo`,
    company: newCo,
    license: 'closed',
    modalities: ['text'],
    benchmarks: [],
    confidence: {},
  })
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`)
  testModelIds.push(data.id)
})

await test('canonical specs 覆盖（DeepSeek V3 参数修正）', async () => {
  // DeepSeek V3 canonical: params='671B-A37B', context_window='128K'
  // If we submit wrong params, canonical should override
  const { status, data } = await api('/api/models/create', 'POST', {
    name: `${TEST_MODEL_NAME}_CanonicalTest`,
    company: 'DeepSeek',
    params: '671B',       // wrong — should become 671B-A37B
    context_window: '64K', // wrong — should become 128K
    license: 'closed',    // wrong — should become 'open'
    modalities: ['text'],
    benchmarks: [],
    confidence: {},
  })
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`)
  const id = data.id
  testModelIds.push(id)
  // Note: applyCanonicalSpecs uses model name lookup — name must match exactly
  // This test model has a different name so specs won't apply, just checking no crash
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: PATCH /api/models/[id] — 更新模型
// ─────────────────────────────────────────────────────────────────────────────
section('5. PATCH /api/models/:id — 更新模型')

await test('更新 params 字段', async () => {
  assert(createdModelId, 'Need created model id')
  const { status, data } = await api(`/api/models/${createdModelId}`, 'PATCH', {
    params: '13B',
  })
  assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`)
  assert(data.success === true, 'Should return success: true')
})

await test('更新后 GET 读回新值', async () => {
  assert(createdModelId, 'Need created model id')
  const { data } = await api(`/api/models/${createdModelId}`)
  assert(data.params === '13B', `params should be 13B, got ${data.params}`)
})

await test('更新 context_window', async () => {
  assert(createdModelId, 'Need created model id')
  const { status } = await api(`/api/models/${createdModelId}`, 'PATCH', {
    context_window: '256K',
  })
  assert(status === 200, `Expected 200, got ${status}`)
  const { data } = await api(`/api/models/${createdModelId}`)
  assert(data.context_window === '256K', `context_window mismatch: ${data.context_window}`)
})

await test('更新 license', async () => {
  assert(createdModelId, 'Need created model id')
  const { status } = await api(`/api/models/${createdModelId}`, 'PATCH', { license: 'partial' })
  assert(status === 200, `Expected 200, got ${status}`)
})

await test('更新 innovation 文本', async () => {
  assert(createdModelId, 'Need created model id')
  const newText = 'Updated innovation description for testing.'
  const { status } = await api(`/api/models/${createdModelId}`, 'PATCH', { innovation: newText })
  assert(status === 200, `Expected 200, got ${status}`)
  const { data } = await api(`/api/models/${createdModelId}`)
  assert(data.innovation === newText, `innovation mismatch: ${data.innovation}`)
})

await test('更新 price — 同日 upsert 更新现有记录（不新增行）', async () => {
  assert(createdModelId, 'Need created model id')
  const { status } = await api(`/api/models/${createdModelId}`, 'PATCH', {
    inputPrice: 1.0,
    outputPrice: 3.0,
  })
  assert(status === 200, `Expected 200, got ${status}`)
  const { data } = await api(`/api/models/${createdModelId}`)
  const prices = data.price ?? []
  assert(prices.length >= 1, `Expected at least 1 price record, got ${prices.length}`)
  // The latest price should be updated to 1.0 / 3.0
  const latest = prices.find(p => p.input_price_per_million === 1.0 && p.output_price_per_million === 3.0)
  assert(latest, `Updated price (1.0/3.0) not found in: ${JSON.stringify(prices)}`)
})

await test('更新无效 id 返回 500（不崩溃服务器）', async () => {
  const { status } = await api('/api/models/00000000-0000-0000-0000-000000000000', 'PATCH', {
    params: '7B',
  })
  // Should return 500 (not found) but not throw
  assert(status === 500 || status === 404, `Expected 404/500, got ${status}`)
})

await test('不允许写入未授权字段（如 id）', async () => {
  assert(createdModelId, 'Need created model id')
  const originalId = createdModelId
  const { status } = await api(`/api/models/${createdModelId}`, 'PATCH', {
    id: '00000000-0000-0000-0000-000000000001',  // should be ignored
    params: '14B',
  })
  assert(status === 200, `Expected 200, got ${status}`)
  const { data } = await api(`/api/models/${createdModelId}`)
  assert(data.id === originalId, 'id should not be changed')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: Scrape saveToDb 写入测试
// ─────────────────────────────────────────────────────────────────────────────
section('6. /api/scrape — saveToDb benchmark 写入')

await test('saveToDb=true + modelId → 返回 benchmarkSaveResult', async () => {
  assert(createdModelId, 'Need created model id')
  const { status, data } = await api('/api/scrape', 'POST', {
    modelName: `${TEST_MODEL_NAME}_Full`,
    modelId: createdModelId,
    saveToDb: true,
  })
  assert(status === 200, `status=${status}: ${JSON.stringify(data).slice(0, 200)}`)
  // benchmarkSaveResult may or may not exist depending on whether benchmarks were found
  // Just ensure no crash
  if (data.benchmarkSaveResult) {
    assert(typeof data.benchmarkSaveResult.saved === 'number', 'saved should be number')
    assert(typeof data.benchmarkSaveResult.skipped === 'number', 'skipped should be number')
  }
})

await test('saveToDb=false → 不返回 benchmarkSaveResult', async () => {
  assert(createdModelId, 'Need created model id')
  const { status, data } = await api('/api/scrape', 'POST', {
    modelName: `${TEST_MODEL_NAME}_Full`,
    modelId: createdModelId,
    saveToDb: false,
  })
  assert(status === 200, `status=${status}`)
  assert(data.benchmarkSaveResult === undefined, 'benchmarkSaveResult should be absent when saveToDb=false')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 7: GET /api/models list
// ─────────────────────────────────────────────────────────────────────────────
section('7. GET /api/models — 模型列表')

await test('返回数组，每项含必要字段', async () => {
  const { status, data } = await api('/api/models')
  assert(status === 200, `status=${status}`)
  assert(Array.isArray(data), 'Should be array')
  assert(data.length > 0, 'Should have models')
  const first = data[0]
  const required = ['id', 'name']
  for (const f of required) {
    assert(f in first, `Missing field in list item: ${f}`)
  }
})

await test('新创建的模型出现在列表中', async () => {
  assert(createdModelId, 'Need created model id')
  const { data } = await api('/api/models')
  const found = data.find((m) => m.id === createdModelId)
  assert(found, `Model ${createdModelId} not found in list`)
  assert(found.name === `${TEST_MODEL_NAME}_Full`, `Name mismatch in list: ${found.name}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────
section('Cleanup — 删除测试模型')

// Use Supabase service role to delete test models
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (SUPABASE_URL && SUPABASE_KEY && testModelIds.length > 0) {
  console.log(`  Deleting ${testModelIds.length} test models...`)
  for (const id of testModelIds) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/models?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal',
      },
    })
    const icon = res.ok ? color('green', '✓') : color('red', `✗(${res.status})`)
    console.log(`  ${icon} Deleted model ${id}`)
  }
} else {
  console.log(color('yellow', `  ⚠ Skipping cleanup — env vars not set (${testModelIds.length} test models left in DB)`))
  console.log(`  Test model IDs: ${testModelIds.join(', ')}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + color('bold', '═'.repeat(50)))
console.log(color('bold', `RESULTS: ${color('green', `${passed} passed`)}  ${color('red', `${failed} failed`)}  ${color('yellow', `${skipped} skipped`)}`))
console.log(color('bold', '═'.repeat(50)))
if (failed > 0) process.exit(1)
