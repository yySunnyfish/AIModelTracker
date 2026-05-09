#!/usr/bin/env node
/**
 * 批量导入主流 AI 模型数据（截止 2026-04-26）
 * 运行: node scripts/import_models.mjs
 */

const BASE = 'http://localhost:3000'

const MODELS = [
  // ── OpenAI ──
  { name: 'GPT-4o',          company: 'OpenAI' },
  { name: 'GPT-4o mini',     company: 'OpenAI' },
  { name: 'o1-mini',         company: 'OpenAI' },
  { name: 'o1-pro',          company: 'OpenAI' },
  { name: 'o1',              company: 'OpenAI' },
  { name: 'o3-mini',         company: 'OpenAI' },
  { name: 'GPT-4.5',         company: 'OpenAI' },
  { name: 'GPT-4.1',         company: 'OpenAI' },
  { name: 'GPT-4.1 mini',    company: 'OpenAI' },
  { name: 'GPT-4.1 nano',    company: 'OpenAI' },
  { name: 'o3',              company: 'OpenAI' },
  { name: 'o4-mini',         company: 'OpenAI' },
  { name: 'Sora',            company: 'OpenAI' },

  // ── Anthropic ──
  { name: 'Claude 3 Haiku',     company: 'Anthropic' },
  { name: 'Claude 3 Sonnet',    company: 'Anthropic' },
  { name: 'Claude 3 Opus',      company: 'Anthropic' },
  { name: 'Claude 3.5 Sonnet',  company: 'Anthropic' },
  { name: 'Claude 3.5 Haiku',   company: 'Anthropic' },
  { name: 'Claude 3.7 Sonnet',  company: 'Anthropic' },

  // ── Google DeepMind ──
  { name: 'Gemini 1.5 Pro',      company: 'Google DeepMind' },
  { name: 'Gemini 1.5 Flash',    company: 'Google DeepMind' },
  { name: 'Gemma 2 27B',         company: 'Google DeepMind' },
  { name: 'Gemma 2 9B',          company: 'Google DeepMind' },
  { name: 'Gemini 2.0 Flash',    company: 'Google DeepMind' },
  { name: 'Gemini 2.0 Flash Lite', company: 'Google DeepMind' },
  { name: 'Gemma 3 27B',         company: 'Google DeepMind' },
  { name: 'Gemma 3 12B',         company: 'Google DeepMind' },
  { name: 'Gemini 2.5 Pro',      company: 'Google DeepMind' },
  { name: 'Gemini 2.5 Flash',    company: 'Google DeepMind' },
  { name: 'Veo 3',               company: 'Google DeepMind' },

  // ── Meta ──
  { name: 'Llama 3.1 70B',        company: 'Meta' },
  { name: 'Llama 3.1 405B',       company: 'Meta' },
  { name: 'Llama 3.2 3B',         company: 'Meta' },
  { name: 'Llama 3.2 11B Vision', company: 'Meta' },
  { name: 'Llama 3.2 90B Vision', company: 'Meta' },
  { name: 'Llama 3.3 70B',        company: 'Meta' },
  { name: 'Llama 4 Scout',        company: 'Meta' },
  { name: 'Llama 4 Maverick',     company: 'Meta' },

  // ── Mistral AI ──
  { name: 'Mixtral 8x22B',     company: 'Mistral AI' },
  { name: 'Mistral Nemo',      company: 'Mistral AI' },
  { name: 'Pixtral 12B',       company: 'Mistral AI' },
  { name: 'Mistral Large 2',   company: 'Mistral AI' },
  { name: 'Codestral 2501',    company: 'Mistral AI' },
  { name: 'Mistral Small 3.1', company: 'Mistral AI' },
  { name: 'Mistral Small 3.2', company: 'Mistral AI' },
  { name: 'Mistral Medium 3',  company: 'Mistral AI' },

  // ── DeepSeek ──
  { name: 'DeepSeek V2.5',    company: 'DeepSeek' },
  { name: 'DeepSeek V3',      company: 'DeepSeek' },
  { name: 'DeepSeek R1',      company: 'DeepSeek' },
  { name: 'DeepSeek V3-0324', company: 'DeepSeek' },
  { name: 'DeepSeek R2',      company: 'DeepSeek' },

  // ── Alibaba / Qwen ──
  { name: 'Qwen2.5 72B',        company: 'Alibaba' },
  { name: 'Qwen2.5-Coder 32B',  company: 'Alibaba' },
  { name: 'Qwen2.5-VL 72B',     company: 'Alibaba' },
  { name: 'QwQ-32B',             company: 'Alibaba' },
  { name: 'Qwen3 32B',           company: 'Alibaba' },
  { name: 'Qwen3 72B',           company: 'Alibaba' },
  { name: 'Qwen3 235B',          company: 'Alibaba' },
  { name: 'Qwen3 30B A3B',       company: 'Alibaba' },

  // ── MiniMax ──
  { name: 'MiniMax-Text-01', company: 'MiniMax' },
  { name: 'MiniMax M2.5',    company: 'MiniMax' },
  { name: 'MiniMax M2.7',    company: 'MiniMax' },

  // ── Zhipu AI ──
  { name: 'GLM-4-Plus',  company: 'Zhipu AI' },
  { name: 'GLM-4V-Plus', company: 'Zhipu AI' },
  { name: 'GLM-5',       company: 'Zhipu AI' },

  // ── Kimi / Moonshot ──
  { name: 'Kimi k1.5',  company: 'Moonshot AI' },
  { name: 'Kimi K2.5',  company: 'Moonshot AI' },
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function scrape({ name, company, url }) {
  const body = { modelName: name, company }
  if (url) body.url = url
  const res = await fetch(`${BASE}/api/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function create(extracted) {
  const res = await fetch(`${BASE}/api/models/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(extracted),
  })
  return res.json()
}

async function main() {
  const results = { ok: [], failed: [], skipped: [] }

  const existing = await fetch(`${BASE}/api/models`).then(r => r.json())
  const existingNames = new Set(existing.map(m => m.name.toLowerCase()))
  console.log(`\nExisting models in DB: ${existingNames.size}`)
  console.log(`Models to import: ${MODELS.length}\n`)

  for (const m of MODELS) {
    if (existingNames.has(m.name.toLowerCase())) {
      console.log(`  ⏭  SKIP  ${m.name} (already in DB)`)
      results.skipped.push(m.name)
      continue
    }

    process.stdout.write(`  ⏳ Scraping  ${m.company} / ${m.name} ... `)
    try {
      const scrapeResult = await scrape(m)
      if (scrapeResult.error) {
        console.log(`✗ scrape: ${scrapeResult.error}`)
        results.failed.push({ name: m.name, reason: scrapeResult.error })
        await sleep(1000)
        continue
      }

      const ext = scrapeResult.extracted
      if (!ext.name) ext.name = m.name
      if (!ext.company) ext.company = m.company

      const createResult = await create(ext)
      if (createResult.error) {
        console.log(`✗ create: ${createResult.error}`)
        results.failed.push({ name: m.name, reason: createResult.error })
      } else {
        const bm = ext.benchmarks?.length ?? 0
        const price = ext.input_price ? `$${ext.input_price}/$${ext.output_price}` : 'no price'
        console.log(`✓  [${scrapeResult.mode}]  params=${ext.params ?? '?'}  ctx=${ext.context_window ?? '?'}  bm=${bm}  ${price}`)
        results.ok.push(m.name)
      }
    } catch (e) {
      console.log(`✗ ${e.message}`)
      results.failed.push({ name: m.name, reason: e.message })
    }

    await sleep(800)
  }

  console.log('\n═══════════════════════════════')
  console.log(`✓ Imported:  ${results.ok.length}`)
  console.log(`⏭ Skipped:   ${results.skipped.length}`)
  console.log(`✗ Failed:    ${results.failed.length}`)
  if (results.failed.length) {
    console.log('\nFailed:')
    results.failed.forEach(f => console.log(`  - ${f.name}: ${f.reason}`))
  }
}

main().catch(console.error)
