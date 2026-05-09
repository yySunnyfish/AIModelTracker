#!/usr/bin/env node
/**
 * 导入 2026年3–4月 真实发布的模型（含已知精确日期）
 * 来源：网络搜索核实
 */

const BASE = 'http://localhost:3000'

// 已知精确发布日期的模型
const MODELS = [
  // ── Google ──
  { name: 'Gemma 4 E2B',       company: 'Google DeepMind', release_date: '2026-03-31' },
  { name: 'Gemma 4 27B',       company: 'Google DeepMind', release_date: '2026-03-31' },

  // ── Mistral AI ──
  { name: 'Mistral Small 4',   company: 'Mistral AI',      release_date: '2026-03-16' },

  // ── Zhipu AI ──
  { name: 'GLM-5.1',           company: 'Zhipu AI',        release_date: '2026-03-27' },

  // ── Alibaba / Qwen ──
  { name: 'Qwen3.5-Omni',      company: 'Alibaba',         release_date: '2026-03-10' },
  { name: 'Qwen3.6-Plus',      company: 'Alibaba',         release_date: '2026-04-01' },
  { name: 'Qwen3.6-35B-A3B',   company: 'Alibaba',         release_date: '2026-04-16' },
  { name: 'Qwen3.6-27B',       company: 'Alibaba',         release_date: '2026-04-22' },
  { name: 'Qwen3.6-Max',       company: 'Alibaba',         release_date: '2026-04-20' },

  // ── Anthropic ──
  { name: 'Claude Opus 4.7',   company: 'Anthropic',       release_date: '2026-04-16' },

  // ── Kimi / Moonshot ──
  { name: 'Kimi K2.6',         company: 'Moonshot AI',     release_date: '2026-04-20' },

  // ── DeepSeek ──
  { name: 'DeepSeek V4-Pro',   company: 'DeepSeek',        release_date: '2026-04-24' },
  { name: 'DeepSeek V4-Flash', company: 'DeepSeek',        release_date: '2026-04-24' },
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function scrape(name, company) {
  const res = await fetch(`${BASE}/api/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelName: name, company }),
  })
  return res.json()
}

async function create(data) {
  const res = await fetch(`${BASE}/api/models/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

async function main() {
  const results = { ok: [], failed: [], skipped: [] }

  // 获取已有模型列表
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

    process.stdout.write(`  ⏳  ${m.release_date}  ${m.company} / ${m.name} ... `)
    try {
      const scrapeResult = await scrape(m.name, m.company)
      if (scrapeResult.error) {
        console.log(`✗ scrape: ${scrapeResult.error}`)
        results.failed.push({ name: m.name, reason: scrapeResult.error })
        await sleep(1000)
        continue
      }

      const ext = scrapeResult.extracted
      if (!ext.name) ext.name = m.name
      if (!ext.company) ext.company = m.company
      // ★ 强制覆盖为已知正确日期
      ext.release_date = m.release_date

      const createResult = await create(ext)
      if (createResult.error) {
        console.log(`✗ create: ${createResult.error}`)
        results.failed.push({ name: m.name, reason: createResult.error })
      } else {
        const bm = ext.benchmarks?.length ?? 0
        const price = ext.input_price ? `$${ext.input_price}/$${ext.output_price}` : 'no price'
        console.log(`✓  params=${ext.params ?? '?'}  ctx=${ext.context_window ?? '?'}  bm=${bm}  ${price}`)
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
