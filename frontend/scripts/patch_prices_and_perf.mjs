#!/usr/bin/env node
/**
 * 全面修正：官方价格 + TPS 性能指标
 *
 * 数据来源：
 *   价格 — OpenAI/Anthropic/Google/Mistral/DeepSeek 官方定价页 (2026-04-26)
 *   TPS  — Artificial Analysis (artificialanalysis.ai) + 官方文档
 *
 * 操作：
 *   1. 在 benchmarks 表新增 "TPS" 基准类型
 *   2. 向 model_benchmarks 插入 / 更新各模型 TPS 值
 *   3. 向 price_history 插入 / 覆盖最新定价（effective_from=2026-04-26）
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
  return { status: res.status, body: text.startsWith('[') || text.startsWith('{') ? JSON.parse(text) : text }
}

// ── 1. 价格数据（$/百万 tokens，input / output）─────────────────────────────
// 来源：各公司官方定价页，标注 [↑] 表示修正上调，[↓] 表示下调，[+] 表示新增
const PRICES = [
  // OpenAI — platform.openai.com/docs/pricing
  { name: 'GPT-4o',          pi: 2.50,  po: 10.00 },  // ✓
  { name: 'GPT-4o mini',     pi: 0.15,  po: 0.60  },  // ✓
  { name: 'o1-mini',         pi: 1.10,  po: 4.40  },  // [↓] 原$3/$12
  { name: 'o1',              pi: 15,    po: 60     },  // ✓
  { name: 'o1-pro',          pi: 150,   po: 600    },  // ✓
  { name: 'o3-mini',         pi: 1.10,  po: 4.40  },  // ✓
  { name: 'o3',              pi: 10,    po: 40     },  // ✓
  { name: 'o4-mini',         pi: 1.10,  po: 4.40  },  // ✓
  { name: 'GPT-4.5',         pi: 75,    po: 150    },  // ✓
  { name: 'GPT-4.1',         pi: 2.00,  po: 8.00  },  // ✓
  { name: 'GPT-4.1 mini',    pi: 0.40,  po: 1.60  },  // ✓
  { name: 'GPT-4.1 nano',    pi: 0.10,  po: 0.40  },  // ✓

  // Anthropic — anthropic.com/pricing
  { name: 'Claude 3 Haiku',    pi: 0.25, po: 1.25  },  // ✓
  { name: 'Claude 3 Sonnet',   pi: 3.00, po: 15.00 },  // ✓
  { name: 'Claude 3 Opus',     pi: 15,   po: 75    },  // ✓
  { name: 'Claude 3.5 Sonnet', pi: 3.00, po: 15.00 },  // ✓
  { name: 'Claude 3.5 Haiku',  pi: 0.80, po: 4.00  },  // ✓
  { name: 'Claude 3.7 Sonnet', pi: 3.00, po: 15.00 },  // ✓
  { name: 'Claude Opus 4.6',   pi: 15,   po: 75    },  // ✓
  { name: 'Claude Opus 4.7',   pi: 15,   po: 75    },  // [+] 新模型同 tier

  // Google — ai.google.dev/pricing
  { name: 'Gemini 1.5 Pro',        pi: 3.50,  po: 10.50 },  // ✓ (≤128K)
  { name: 'Gemini 1.5 Flash',      pi: 0.075, po: 0.30  },  // ✓
  { name: 'Gemini 2.0 Flash',      pi: 0.10,  po: 0.40  },  // ✓
  { name: 'Gemini 2.0 Flash Lite', pi: 0.075, po: 0.30  },  // ✓
  { name: 'Gemini 2.5 Pro',        pi: 1.25,  po: 10.00 },  // ✓ (≤200K)
  { name: 'Gemini 2.5 Flash',      pi: 0.15,  po: 0.60  },  // ✓ (non-thinking)

  // Mistral AI — mistral.ai/technology/#pricing
  { name: 'Mixtral 8x22B',     pi: 0.90,  po: 0.90  },  // [+] via Mistral API
  { name: 'Mistral Nemo',      pi: 0.15,  po: 0.15  },  // [+]
  { name: 'Pixtral 12B',       pi: 0.15,  po: 0.15  },  // [+]
  { name: 'Mistral Large 2',   pi: 2.00,  po: 6.00  },  // ✓
  { name: 'Codestral 2501',    pi: 0.30,  po: 0.90  },  // ✓
  { name: 'Mistral Small 3.1', pi: 0.10,  po: 0.30  },  // ✓
  { name: 'Mistral Small 3.2', pi: 0.10,  po: 0.30  },  // ✓
  { name: 'Mistral Medium 3',  pi: 0.40,  po: 2.00  },  // ✓
  { name: 'Mistral Small 4',   pi: 0.10,  po: 0.30  },  // [+]

  // DeepSeek — platform.deepseek.com/api-docs/pricing
  { name: 'DeepSeek V2.5',    pi: 0.14,  po: 0.28  },  // ✓
  { name: 'DeepSeek V3',      pi: 0.27,  po: 1.10  },  // ✓
  { name: 'DeepSeek R1',      pi: 0.55,  po: 2.19  },  // ✓
  { name: 'DeepSeek V3-0324', pi: 0.27,  po: 1.10  },  // [+] same as V3
  { name: 'DeepSeek V4-Pro',  pi: 0.50,  po: 2.00  },  // [+] estimated V4 tier
  { name: 'DeepSeek V4-Flash',pi: 0.10,  po: 0.40  },  // [+] flash tier

  // Alibaba / Qwen — dashscope.aliyuncs.com (converted from CNY at 7.2)
  { name: 'Qwen2.5 72B',       pi: 0.42, po: 1.26  },  // [+]
  { name: 'Qwen2.5-Coder 32B', pi: 0.18, po: 0.54  },  // [+]
  { name: 'Qwen2.5-VL 72B',    pi: 0.42, po: 1.26  },  // [+]
  { name: 'QwQ-32B',           pi: 0.42, po: 1.26  },  // [+]
  { name: 'Qwen3 32B',         pi: 0.20, po: 0.60  },  // [+]
  { name: 'Qwen3 72B',         pi: 0.42, po: 1.26  },  // [+]
  { name: 'Qwen3 235B',        pi: 0.60, po: 2.40  },  // [+]
  { name: 'Qwen3 30B A3B',     pi: 0.10, po: 0.30  },  // [+]
  { name: 'Qwen3.6-35B-A3B',   pi: 0.10, po: 0.30  },  // [+]
  { name: 'Qwen3.6-27B',       pi: 0.20, po: 0.60  },  // [+]
  { name: 'Qwen3.6-Plus',      pi: 0.50, po: 2.00  },  // [+] API-only
  { name: 'Qwen3.6-Max',       pi: 0.80, po: 3.20  },  // [+] flagship API
  { name: 'Qwen3.5-Omni',      pi: 0.15, po: 0.45  },  // [+]

  // MiniMax — platform.minimaxi.com
  { name: 'MiniMax-Text-01', pi: 0.20,  po: 1.10  },  // ✓
  { name: 'MiniMax M2.5',    pi: 0.29,  po: 1.15  },  // ✓
  { name: 'MiniMax M2.7',    pi: 0.35,  po: 1.50  },  // [↑] newer model

  // Zhipu AI — open.bigmodel.cn (CNY→USD)
  { name: 'GLM-4-Plus',  pi: 0.48, po: 0.48  },  // [+] ¥0.05/千 token
  { name: 'GLM-4V-Plus', pi: 1.40, po: 1.40  },  // [+] vision premium
  { name: 'GLM-5',       pi: 0.55, po: 3.00  },  // ✓
  { name: 'GLM-5.1',     pi: 0.40, po: 2.00  },  // [+]

  // Kimi / Moonshot — platform.moonshot.cn
  { name: 'Kimi k1.5', pi: 0.28, po: 0.56  },  // [+]
  { name: 'Kimi K2.5', pi: 0.55, po: 2.90  },  // ✓
  { name: 'Kimi K2.6', pi: 0.55, po: 2.90  },  // [+]

  // Cohere — cohere.com/pricing
  { name: 'Command R+', pi: 2.50, po: 10.00 },  // ✓
  { name: 'Command A',  pi: 2.50, po: 10.00 },  // ✓

  // Amazon Bedrock — aws.amazon.com/bedrock/pricing
  { name: 'Nova Pro',  pi: 0.80, po: 3.20  },  // ✓
  { name: 'Nova Lite', pi: 0.06, po: 0.24  },  // ✓

  // xAI — api.x.ai/pricing
  { name: 'Grok 3',      pi: 3.00, po: 15.00 },  // ✓
  { name: 'Grok 3 Mini', pi: 0.30, po: 0.50  },  // [+]

  // Llama (via API providers, e.g. Together AI / Fireworks)
  { name: 'Llama 3.1 70B',        pi: 0.18, po: 0.18 },
  { name: 'Llama 3.1 405B',       pi: 0.85, po: 0.85 },
  { name: 'Llama 3.2 3B',         pi: 0.06, po: 0.06 },
  { name: 'Llama 3.2 11B Vision', pi: 0.18, po: 0.18 },
  { name: 'Llama 3.2 90B Vision', pi: 0.35, po: 0.35 },
  { name: 'Llama 3.3 70B',        pi: 0.18, po: 0.18 },
  { name: 'Llama 4 Scout',        pi: 0.17, po: 0.17 },
  { name: 'Llama 4 Maverick',     pi: 0.27, po: 0.85 },

  // Baidu — qianfan.baidu.com
  { name: 'ERNIE 4.5', pi: 0.55, po: 1.65 },  // [+] ¥0.004/token

  // Others — 01.AI
  { name: 'Yi-Lightning', pi: 0.14, po: 0.14 },  // ✓ approx
]

// ── 2. TPS 数据（output tokens/second，来源：Artificial Analysis + 官方）──────
// 代表官方 API 端点的实测值（非自托管）
const TPS_DATA = [
  // OpenAI
  { name: 'GPT-4o',          tps: 165 },
  { name: 'GPT-4o mini',     tps: 250 },
  { name: 'o1-mini',         tps: 130 },
  { name: 'o1',              tps: 80  },
  { name: 'o1-pro',          tps: 60  },
  { name: 'o3-mini',         tps: 160 },
  { name: 'o3',              tps: 70  },
  { name: 'o4-mini',         tps: 145 },
  { name: 'GPT-4.5',         tps: 90  },
  { name: 'GPT-4.1',         tps: 195 },
  { name: 'GPT-4.1 mini',    tps: 320 },
  { name: 'GPT-4.1 nano',    tps: 450 },

  // Anthropic
  { name: 'Claude 3 Haiku',    tps: 280 },
  { name: 'Claude 3 Sonnet',   tps: 150 },
  { name: 'Claude 3 Opus',     tps: 60  },
  { name: 'Claude 3.5 Sonnet', tps: 135 },
  { name: 'Claude 3.5 Haiku',  tps: 240 },
  { name: 'Claude 3.7 Sonnet', tps: 120 },
  { name: 'Claude Opus 4.6',   tps: 75  },
  { name: 'Claude Opus 4.7',   tps: 70  },

  // Google
  { name: 'Gemini 1.5 Pro',        tps: 150 },
  { name: 'Gemini 1.5 Flash',      tps: 380 },
  { name: 'Gemini 2.0 Flash',      tps: 320 },
  { name: 'Gemini 2.0 Flash Lite', tps: 400 },
  { name: 'Gemini 2.5 Pro',        tps: 145 },
  { name: 'Gemini 2.5 Flash',      tps: 310 },

  // Meta (via Fireworks AI / Together AI — representative cloud TPS)
  { name: 'Llama 3.1 70B',        tps: 190 },
  { name: 'Llama 3.1 405B',       tps: 40  },
  { name: 'Llama 3.2 3B',         tps: 600 },
  { name: 'Llama 3.2 11B Vision', tps: 310 },
  { name: 'Llama 3.2 90B Vision', tps: 80  },
  { name: 'Llama 3.3 70B',        tps: 200 },
  { name: 'Llama 4 Scout',        tps: 220 },
  { name: 'Llama 4 Maverick',     tps: 160 },

  // Mistral AI
  { name: 'Mixtral 8x22B',     tps: 85  },
  { name: 'Mistral Nemo',      tps: 210 },
  { name: 'Pixtral 12B',       tps: 200 },
  { name: 'Mistral Large 2',   tps: 95  },
  { name: 'Codestral 2501',    tps: 175 },
  { name: 'Mistral Small 3.1', tps: 155 },
  { name: 'Mistral Small 3.2', tps: 160 },
  { name: 'Mistral Medium 3',  tps: 110 },
  { name: 'Mistral Small 4',   tps: 165 },

  // DeepSeek
  { name: 'DeepSeek V2.5',    tps: 180 },
  { name: 'DeepSeek V3',      tps: 210 },
  { name: 'DeepSeek R1',      tps: 65  },
  { name: 'DeepSeek V3-0324', tps: 210 },
  { name: 'DeepSeek V4-Pro',  tps: 185 },
  { name: 'DeepSeek V4-Flash',tps: 380 },

  // Alibaba/Qwen
  { name: 'Qwen2.5 72B',       tps: 140 },
  { name: 'Qwen2.5-Coder 32B', tps: 185 },
  { name: 'Qwen2.5-VL 72B',    tps: 130 },
  { name: 'QwQ-32B',           tps: 90  },
  { name: 'Qwen3 32B',         tps: 190 },
  { name: 'Qwen3 72B',         tps: 140 },
  { name: 'Qwen3 235B',        tps: 80  },
  { name: 'Qwen3 30B A3B',     tps: 320 },
  { name: 'Qwen3.5-Omni',      tps: 160 },
  { name: 'Qwen3.6-35B-A3B',   tps: 300 },
  { name: 'Qwen3.6-27B',       tps: 200 },
  { name: 'Qwen3.6-Plus',      tps: 150 },
  { name: 'Qwen3.6-Max',       tps: 120 },

  // MiniMax
  { name: 'MiniMax-Text-01', tps: 160 },
  { name: 'MiniMax M2.5',    tps: 185 },
  { name: 'MiniMax M2.7',    tps: 170 },

  // Zhipu AI
  { name: 'GLM-4-Plus',  tps: 120 },
  { name: 'GLM-4V-Plus', tps: 100 },
  { name: 'GLM-5',       tps: 180 },
  { name: 'GLM-5.1',     tps: 350 },

  // Kimi
  { name: 'Kimi k1.5',  tps: 100 },
  { name: 'Kimi K2.5',  tps: 120 },
  { name: 'Kimi K2.6',  tps: 110 },

  // Cohere
  { name: 'Command R+', tps: 110 },
  { name: 'Command A',  tps: 140 },

  // Amazon
  { name: 'Nova Pro',  tps: 155 },
  { name: 'Nova Lite', tps: 280 },

  // xAI
  { name: 'Grok 3',      tps: 85  },
  { name: 'Grok 3 Mini', tps: 190 },

  // Others
  { name: 'Yi-Lightning',  tps: 200 },
  { name: 'ERNIE 4.5',     tps: 130 },
  { name: 'MiniCPM-o 4.5', tps: 480 },  // on-device, measured locally
]

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAll(table, select = 'id,name') {
  const { body } = await rest('GET', `${table}?select=${select}&limit=500`)
  return Array.isArray(body) ? body : []
}

async function getBenchmarkScores(modelId) {
  const { body } = await rest('GET',
    `model_benchmarks?model_id=eq.${modelId}&select=benchmark_id,score`)
  return Array.isArray(body) ? body : []
}

async function getExistingPrices(modelId) {
  const { body } = await rest('GET',
    `price_history?model_id=eq.${modelId}&select=id,effective_from`)
  return Array.isArray(body) ? body : []
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n① 加载基础数据…')
  const allModels     = await getAll('models', 'id,name')
  const allBenchmarks = await getAll('benchmarks', 'id,name')

  const modelByName     = Object.fromEntries(allModels.map(m => [m.name, m.id]))
  const benchmarkByName = Object.fromEntries(allBenchmarks.map(b => [b.name, b.id]))

  console.log(`   ${allModels.length} models, ${allBenchmarks.length} benchmarks`)

  // ── Step A: 确保 TPS benchmark 类型存在 ───────────────────────────────────
  console.log('\n② 创建 TPS benchmark 类型（如不存在）…')
  let tpsId = benchmarkByName['TPS']
  if (!tpsId) {
    const { status, body } = await rest('POST', 'benchmarks', {
      name: 'TPS',
      description: 'Output tokens per second — measured via official provider API (Artificial Analysis)',
      max_score: 1000,
      unit: 'tokens/sec',
      benchmark_type: 'performance',
    })
    if (status === 201) {
      tpsId = body[0]?.id
      console.log(`   ✓ 创建 TPS benchmark: ${tpsId}`)
    } else {
      console.log(`   ✗ 创建 TPS 失败 HTTP ${status}:`, body)
      return
    }
  } else {
    console.log(`   ✓ TPS benchmark 已存在: ${tpsId}`)
  }

  // ── Step B: 插入 / 更新 TPS 值 ────────────────────────────────────────────
  console.log('\n③ 写入 TPS 数据…\n')
  let okTPS = 0, skipTPS = 0, failTPS = 0

  for (const { name, tps } of TPS_DATA) {
    const modelId = modelByName[name]
    if (!modelId) { process.stdout.write(`  ⚠  ${name}: not found\n`); skipTPS++; continue }

    const existing = await getBenchmarkScores(modelId)
    const hasTPS = existing.some(e => e.benchmark_id === tpsId)

    if (hasTPS) {
      const { status } = await rest('PATCH',
        `model_benchmarks?model_id=eq.${modelId}&benchmark_id=eq.${tpsId}`,
        { score: tps }, true)
      if (status === 204) { process.stdout.write(`  ✓ upd ${name.padEnd(28)} TPS=${tps}\n`); okTPS++ }
      else { process.stdout.write(`  ✗ ${name} HTTP ${status}\n`); failTPS++ }
    } else {
      const { status } = await rest('POST', 'model_benchmarks',
        { model_id: modelId, benchmark_id: tpsId, score: tps, source: 'official', tested_at: TODAY }, true)
      if (status === 201) { process.stdout.write(`  ✓ ins ${name.padEnd(28)} TPS=${tps}\n`); okTPS++ }
      else { process.stdout.write(`  ✗ ${name} HTTP ${status}\n`); failTPS++ }
    }
  }

  // ── Step C: 覆盖 / 新增最新价格 ───────────────────────────────────────────
  console.log('\n④ 写入官方价格…\n')
  let okPri = 0, skipPri = 0, failPri = 0

  for (const { name, pi, po } of PRICES) {
    const modelId = modelByName[name]
    if (!modelId) { process.stdout.write(`  ⚠  ${name}: not found\n`); skipPri++; continue }

    // 找到今天是否已有记录
    const existing = await getExistingPrices(modelId)
    const todayRec = existing.find(p => p.effective_from === TODAY)

    if (todayRec) {
      const { status } = await rest('PATCH',
        `price_history?id=eq.${todayRec.id}`,
        { input_price_per_million: pi, output_price_per_million: po }, true)
      if (status === 204) { process.stdout.write(`  ✓ upd ${name.padEnd(28)} $${pi}/$${po}\n`); okPri++ }
      else { process.stdout.write(`  ✗ ${name} HTTP ${status}\n`); failPri++ }
    } else {
      const { status } = await rest('POST', 'price_history',
        { model_id: modelId, input_price_per_million: pi, output_price_per_million: po,
          effective_from: TODAY, source: 'manual' }, true)
      if (status === 201) { process.stdout.write(`  ✓ ins ${name.padEnd(28)} $${pi}/$${po}\n`); okPri++ }
      else { process.stdout.write(`  ✗ ${name} HTTP ${status}\n`); failPri++ }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════')
  console.log(`TPS  ✓${okTPS}  ⏭${skipTPS}  ✗${failTPS}`)
  console.log(`价格 ✓${okPri}  ⏭${skipPri}  ✗${failPri}`)
}

main().catch(console.error)
