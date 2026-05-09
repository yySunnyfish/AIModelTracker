#!/usr/bin/env node
/**
 * 公司/模型数据更新
 *
 * 删除：01.AI (Yi-Lightning)、ModelBest (MiniCPM-o 4.5)、Cohere (Command R+, Command A)
 * 新增：小米 Xiaomi 公司 + MiMo-7B 模型
 *
 * 操作：软删除（设置 archived_at）而非硬删除，保留历史数据
 */

const SUPABASE_URL = 'https://iufcjqzeeqatdzqopism.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZmNqcXplZXFhdGR6cW9waXNtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE0OTIyNywiZXhwIjoyMDkyNzI1MjI3fQ.sPBcJhg9q-ZbZw0_Bdv38lmMsu7UAIDLK5CUtiMNIKg'
const TODAY = '2026-04-26'

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}
const headersMin = { ...headers, Prefer: 'return=minimal' }

async function rest(method, path, body, minimal = false) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers: minimal ? headersMin : headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return {
    status: res.status,
    body: text.startsWith('[') || text.startsWith('{') ? JSON.parse(text) : text,
  }
}

// ── Models to archive ──────────────────────────────────────────────────────
const ARCHIVE_MODELS = [
  'Yi-Lightning',    // 01.AI
  'MiniCPM-o 4.5',  // ModelBest
  'Command R+',     // Cohere
  'Command A',      // Cohere
]

// ── Companies to archive ───────────────────────────────────────────────────
const ARCHIVE_COMPANIES = ['01.AI', 'ModelBest', 'Cohere']

// ── New company ────────────────────────────────────────────────────────────
const NEW_COMPANY = {
  name:   'Xiaomi',
  region: 'CN',
  type:   'LLM',
}

// ── New model ──────────────────────────────────────────────────────────────
const NEW_MODEL = {
  name:           'MiMo-7B',
  params:         '7B',
  context_window: '32K',
  license:        'open',
  modalities:     ['text', 'code'],
  release_date:   '2025-03-28',
  category:       'reasoning',
  architecture:   'Dense Transformer, RL post-training',
  innovation:     'AIME 2025 68.2%, LiveCodeBench 57.8% — open 7B reasoning model via process-reward RL on Qwen2.5-Math base',
  color:          '#FF6900',
  data_source:    'manual',
}

// ── New model benchmarks ───────────────────────────────────────────────────
const NEW_MODEL_BENCHMARKS = [
  { name: 'MMLU',      score: 72.0 },
  { name: 'SWE-bench', score: 32.0 },
]

async function main() {
  // ── 1. Load existing data ──────────────────────────────────────────────
  console.log('\n① 加载现有数据…')
  const { body: allModels }     = await rest('GET', 'models?select=id,name&limit=500')
  const { body: allCompanies }  = await rest('GET', 'companies?select=id,name&limit=200')
  const { body: allBenchmarks } = await rest('GET', 'benchmarks?select=id,name')

  const modelByName     = Object.fromEntries(allModels.map(m => [m.name, m.id]))
  const companyByName   = Object.fromEntries(allCompanies.map(c => [c.name, c.id]))
  const benchmarkByName = Object.fromEntries(allBenchmarks.map(b => [b.name, b.id]))

  console.log(`   ${allModels.length} models, ${allCompanies.length} companies, ${allBenchmarks.length} benchmarks`)

  // ── 2. Archive models ──────────────────────────────────────────────────
  console.log('\n② 归档废弃模型…')
  for (const name of ARCHIVE_MODELS) {
    const id = modelByName[name]
    if (!id) { console.log(`  ⚠  ${name}: not found`); continue }
    const { status } = await rest('PATCH', `models?id=eq.${id}`,
      { archived_at: new Date().toISOString() }, true)
    console.log(status === 204 ? `  ✓  archived ${name}` : `  ✗  ${name} HTTP ${status}`)
  }

  // ── 3. Archive companies ───────────────────────────────────────────────
  console.log('\n③ 归档废弃公司…')
  for (const name of ARCHIVE_COMPANIES) {
    const id = companyByName[name]
    if (!id) { console.log(`  ⚠  ${name}: not found`); continue }
    // companies table may not have archived_at; try to update a note field or skip gracefully
    const { status, body } = await rest('PATCH', `companies?id=eq.${id}`,
      { archived_at: new Date().toISOString() }, true)
    if (status === 204) {
      console.log(`  ✓  archived company ${name}`)
    } else if (status === 400 && JSON.stringify(body).includes('archived_at')) {
      console.log(`  ℹ  ${name}: companies table has no archived_at column — skipped (manual)`)
    } else {
      console.log(`  ✗  ${name} HTTP ${status}:`, body)
    }
  }

  // ── 4. Insert Xiaomi company ──────────────────────────────────────────
  console.log('\n④ 新增小米公司…')
  if (companyByName['Xiaomi']) {
    console.log('  ✓  Xiaomi 已存在:', companyByName['Xiaomi'])
  } else {
    const { status, body } = await rest('POST', 'companies', NEW_COMPANY)
    if (status === 201) {
      const newId = body[0]?.id
      companyByName['Xiaomi'] = newId
      console.log(`  ✓  inserted Xiaomi id=${newId}`)
    } else {
      console.log(`  ✗  insert company HTTP ${status}:`, body)
      return
    }
  }

  // ── 5. Insert MiMo-7B model ───────────────────────────────────────────
  console.log('\n⑤ 新增 MiMo-7B 模型…')
  if (modelByName['MiMo-7B']) {
    console.log('  ✓  MiMo-7B 已存在:', modelByName['MiMo-7B'])
  } else {
    const { status, body } = await rest('POST', 'models', {
      ...NEW_MODEL,
      company_id: companyByName['Xiaomi'],
    })
    if (status === 201) {
      const newModelId = body[0]?.id
      modelByName['MiMo-7B'] = newModelId
      console.log(`  ✓  inserted MiMo-7B id=${newModelId}`)
    } else {
      console.log(`  ✗  insert model HTTP ${status}:`, body)
      return
    }
  }

  // ── 6. Insert benchmark scores for MiMo-7B ───────────────────────────
  console.log('\n⑥ 写入 MiMo-7B benchmark 分数…')
  const mimoId = modelByName['MiMo-7B']
  for (const { name, score } of NEW_MODEL_BENCHMARKS) {
    const benchId = benchmarkByName[name]
    if (!benchId) { console.log(`  ⚠  benchmark "${name}" not found`); continue }
    const { status } = await rest('POST', 'model_benchmarks',
      { model_id: mimoId, benchmark_id: benchId, score,
        source: 'manual', tested_at: TODAY }, true)
    console.log(status === 201 ? `  ✓  ${name}=${score}` : `  ✗  ${name} HTTP ${status}`)
  }

  // ── 7. Insert MiMo-7B price record (free / open-source) ──────────────
  console.log('\n⑦ 写入 MiMo-7B 价格（开源免费）…')
  const { status: priceStatus } = await rest('POST', 'price_history', {
    model_id: mimoId,
    input_price_per_million:  0,
    output_price_per_million: 0,
    effective_from: TODAY,
    source: 'manual',
  }, true)
  console.log(priceStatus === 201 ? '  ✓  price record inserted' : `  ✗  HTTP ${priceStatus}`)

  console.log('\n══════════════════════════════════════')
  console.log('完成。请刷新前端以查看更新。')
}

main().catch(console.error)
