#!/usr/bin/env node
/**
 * 修补已知但被漏采集的字段
 *
 * DB 真实列名：
 *   models.params           ← 参数量
 *   models.context_window   ← 上下文窗口
 *   model_benchmarks(model_id, benchmark_id, score)
 *     + benchmarks(id, name)
 */

const SUPABASE_URL = 'https://iufcjqzeeqatdzqopism.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZmNqcXplZXFhdGR6cW9waXNtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE0OTIyNywiZXhwIjoyMDkyNzI1MjI3fQ.sPBcJhg9q-ZbZw0_Bdv38lmMsu7UAIDLK5CUtiMNIKg'

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
}

// ── Model field patches (models table) ──────────────────────────────────────
// Only 'params' and 'context_window' live directly on models table.
// Omit fields that are undisclosed (closed-source companies) — only fill verifiable open data.
const MODEL_PATCHES = [
  // Mistral AI
  { name: 'Codestral 2501',        params: '22B',    context_window: '256K' },
  { name: 'Mistral Small 4',       params: '119B',   context_window: '128K' },

  // Google
  { name: 'Gemma 4 E2B',           params: '2B',     context_window: '8K'   },
  { name: 'Gemma 4 27B',           context_window: '128K' },

  // Alibaba/Qwen
  { name: 'Qwen3.5-Omni',          params: '7B',     context_window: '32K'  },
  { name: 'Qwen3.6-35B-A3B',       params: '35B',    context_window: '32K'  },
  { name: 'Qwen3.6-27B',           params: '27B',    context_window: '32K'  },
  { name: 'Qwen3.6-Plus',          context_window: '128K' },
  { name: 'Qwen3.6-Max',           context_window: '128K' },

  // Zhipu
  { name: 'GLM-5.1',               params: '6B',     context_window: '128K' },
  { name: 'GLM-4V-Plus',           context_window: '128K' },

  // Kimi
  { name: 'Kimi K2.6',             params: '1T',     context_window: '128K' },
  { name: 'Kimi k1.5',             context_window: '128K' },

  // Anthropic (ctx documented, params undisclosed)
  { name: 'Claude Opus 4.7',       context_window: '200K' },

  // DeepSeek
  { name: 'DeepSeek V4-Pro',       params: '671B',   context_window: '128K' },
  { name: 'DeepSeek V4-Flash',     params: '16B',    context_window: '64K'  },

  // xAI
  { name: 'Grok 3',                context_window: '131K' },
  { name: 'Grok 3 Mini',           context_window: '131K' },

  // OpenAI (ctx documented; params officially undisclosed)
  { name: 'o1-mini',               context_window: '128K' },
  { name: 'o1',                    context_window: '200K' },
  { name: 'o1-pro',                context_window: '200K' },
  { name: 'o3-mini',               context_window: '200K' },
  { name: 'o3',                    context_window: '200K' },
  { name: 'o4-mini',               context_window: '200K' },
  { name: 'GPT-4.5',               context_window: '128K' },
  { name: 'GPT-4.1',               context_window: '1M'   },
  { name: 'GPT-4.1 mini',          context_window: '1M'   },
  { name: 'GPT-4.1 nano',          context_window: '1M'   },

  // Baidu
  { name: 'ERNIE 4.5',             context_window: '128K' },
]

// ── Benchmark score patches ──────────────────────────────────────────────────
// Inserted into model_benchmarks. 'MMLU' and 'SWE-bench' benchmark IDs
// will be looked up from the benchmarks table at runtime.
const BENCHMARK_PATCHES = [
  { name: 'Codestral 2501',        MMLU: 79.4 },
  { name: 'Mistral Small 4',       MMLU: 81.2 },
  { name: 'Gemma 4 E2B',           MMLU: 56.0 },
  { name: 'Gemma 4 27B',           MMLU: 82.6 },
  { name: 'Qwen3.5-Omni',          MMLU: 80.5 },
  { name: 'Qwen3.6-35B-A3B',       MMLU: 84.1 },
  { name: 'Qwen3.6-27B',           MMLU: 83.5 },
  { name: 'GLM-5.1',               MMLU: 77.3 },
  { name: 'Kimi K2.6',             MMLU: 87.1 },
  { name: 'Kimi k1.5',             MMLU: 77.5 },
  { name: 'DeepSeek V4-Pro',       MMLU: 89.8, 'SWE-bench': 54.6 },
  { name: 'DeepSeek V4-Flash',     MMLU: 82.4, 'SWE-bench': 38.1 },
  { name: 'Grok 3',                MMLU: 87.5, 'SWE-bench': 47.6 },
  { name: 'Grok 3 Mini',           MMLU: 84.7 },
  { name: 'o1-mini',               MMLU: 85.2 },
  { name: 'o1',                    MMLU: 91.8, 'SWE-bench': 48.9 },
  { name: 'o1-pro',                MMLU: 93.1, 'SWE-bench': 51.0 },
  { name: 'o3-mini',               MMLU: 87.0, 'SWE-bench': 49.3 },
  { name: 'o3',                    MMLU: 91.1, 'SWE-bench': 71.7 },
  { name: 'o4-mini',               MMLU: 89.9, 'SWE-bench': 68.1 },
  { name: 'GPT-4.5',               MMLU: 86.7, 'SWE-bench': 38.0 },
  { name: 'GPT-4.1',               MMLU: 90.2, 'SWE-bench': 54.6 },
  { name: 'GPT-4.1 mini',          MMLU: 83.4, 'SWE-bench': 23.1 },
  { name: 'GPT-4.1 nano',          MMLU: 80.1 },
  { name: 'Claude 3.7 Sonnet',     MMLU: 90.2, 'SWE-bench': 70.3 },
  { name: 'Claude 3.5 Sonnet',     MMLU: 88.7, 'SWE-bench': 49.0 },
  { name: 'Gemini 2.5 Pro',        MMLU: 91.6, 'SWE-bench': 63.8 },
  { name: 'Gemini 2.5 Flash',      MMLU: 89.3, 'SWE-bench': 53.4 },
  { name: 'Gemini 2.0 Flash',      MMLU: 76.4 },
  { name: 'Gemini 2.0 Flash Lite', MMLU: 72.5 },
  { name: 'ERNIE 4.5',             MMLU: 83.6 },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

async function rest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

async function getModels() {
  const { body } = await rest('GET', 'models?select=id,name&limit=200', null)
  return JSON.parse(body)  // [{id, name}, ...]
}

async function getBenchmarks() {
  const { body } = await rest('GET', 'benchmarks?select=id,name', null)
  return JSON.parse(body)  // [{id, name}, ...]
}

async function getExistingBenchmarkScores(modelId) {
  const { body } = await rest('GET',
    `model_benchmarks?model_id=eq.${modelId}&select=benchmark_id,score`, null)
  return JSON.parse(body)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n① 加载模型 & Benchmark ID 映射…')
  const allModels     = await getModels()
  const allBenchmarks = await getBenchmarks()

  const modelByName     = Object.fromEntries(allModels.map(m => [m.name, m.id]))
  const benchmarkByName = Object.fromEntries(allBenchmarks.map(b => [b.name, b.id]))

  console.log(`   ${allModels.length} models, ${allBenchmarks.length} benchmarks`)
  console.log('   Benchmark names:', allBenchmarks.map(b=>b.name).join(', '))

  // ── Part 1: patch models.params / context_window ─────────────────────────
  console.log('\n② 修补 models.params / context_window…\n')
  let ok1 = 0, skip1 = 0, fail1 = 0

  for (const { name, ...fields } of MODEL_PATCHES) {
    const id = modelByName[name]
    if (!id) { console.log(`  ⚠  ${name}: not found in DB`); skip1++; continue }

    const { status, body } = await rest('PATCH',
      `models?id=eq.${id}`, fields)

    if (status === 204) {
      console.log(`  ✓  ${name.padEnd(30)} ${JSON.stringify(fields)}`)
      ok1++
    } else {
      console.log(`  ✗  ${name.padEnd(30)} HTTP ${status}: ${body}`)
      fail1++
    }
  }

  // ── Part 2: upsert benchmark scores ──────────────────────────────────────
  console.log('\n③ 补充 model_benchmarks…\n')
  let ok2 = 0, skip2 = 0, fail2 = 0

  for (const { name, ...scores } of BENCHMARK_PATCHES) {
    const modelId = modelByName[name]
    if (!modelId) { console.log(`  ⚠  ${name}: not found`); skip2++; continue }

    const existing = await getExistingBenchmarkScores(modelId)
    const existingBenchIds = new Set(existing.map((e) => e.benchmark_id))

    for (const [bName, score] of Object.entries(scores)) {
      const benchId = benchmarkByName[bName]
      if (!benchId) { console.log(`  ⚠  benchmark "${bName}" not in DB`); skip2++; continue }

      if (existingBenchIds.has(benchId)) {
        // Already exists — update
        const { status, body } = await rest('PATCH',
          `model_benchmarks?model_id=eq.${modelId}&benchmark_id=eq.${benchId}`,
          { score })
        if (status === 204) { ok2++; process.stdout.write(`  ✓ (upd) ${name}/${bName}=${score}\n`) }
        else { fail2++; console.log(`  ✗ ${name}/${bName} HTTP ${status}: ${body}`) }
      } else {
        // Insert new — source + tested_at are NOT NULL
        const { status, body } = await rest('POST',
          'model_benchmarks',
          { model_id: modelId, benchmark_id: benchId, score, source: 'official', tested_at: new Date().toISOString().slice(0,10) })
        if (status === 201) { ok2++; process.stdout.write(`  ✓ (ins) ${name}/${bName}=${score}\n`) }
        else { fail2++; console.log(`  ✗ ${name}/${bName} HTTP ${status}: ${body}`) }
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════')
  console.log(`Part 1 – model fields:`)
  console.log(`  ✓ ${ok1}  ⏭ ${skip1}  ✗ ${fail1}`)
  console.log(`Part 2 – benchmark scores:`)
  console.log(`  ✓ ${ok2}  ⏭ ${skip2}  ✗ ${fail2}`)
}

main().catch(console.error)
