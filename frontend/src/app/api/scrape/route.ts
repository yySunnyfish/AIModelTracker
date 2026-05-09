import { NextResponse } from 'next/server'
import { requireWriteAccess } from '@/lib/route_auth'
import { extractModelData, ExtractedModel } from '@/lib/extractor'
import { createServerClient } from '@/lib/supabase'
import { getOfficialBenchmarks, normBenchmarkName } from '@/lib/benchmark_scrapers'
import { fetchMultiSource, EvidenceMap } from '@/lib/multi_source_fetcher'
import { getModelSources } from '@/lib/source_registry'
import { validateExtracted, ValidationReport } from '@/lib/field_validator'

/**
 * Extract the Artificial Analysis URL slug from a model's registry entry.
 * AA URLs look like: https://artificialanalysis.ai/models/claude-3-7-sonnet
 */
function extractAASlug(modelName: string, company?: string): string | undefined {
  const entry = getModelSources(modelName, company)
  if (!entry?.evals) return undefined
  const aaUrl = entry.evals.find(u => u.includes('artificialanalysis.ai/models/'))
  if (!aaUrl) return undefined
  const m = aaUrl.match(/artificialanalysis\.ai\/models\/([^/?#]+)/)
  return m?.[1]
}

// ─── Benchmark upsert ─────────────────────────────────────────────────────────

interface BenchmarkToSave {
  name: string
  score: number
  source: 'official' | 'llm_extracted'
  confidence_score: number
}

/**
 * Upsert benchmark scores for a model into model_benchmarks table.
 * Uses benchmark name → id lookup, skips unknown benchmark names.
 */
async function saveBenchmarks(
  supabase: ReturnType<typeof createServerClient>,
  modelId: string,
  benchmarks: BenchmarkToSave[],
): Promise<{ saved: number; skipped: number }> {
  if (!benchmarks.length) return { saved: 0, skipped: 0 }

  // Fetch all known benchmarks
  const { data: knownBenchmarks } = await supabase
    .from('benchmarks')
    .select('id, name')

  if (!knownBenchmarks?.length) return { saved: 0, skipped: benchmarks.length }

  const idByName = new Map<string, string>()
  for (const b of knownBenchmarks) {
    idByName.set(b.name.toLowerCase(), b.id)
    idByName.set(normBenchmarkName(b.name).toLowerCase(), b.id)
  }

  const today = new Date().toISOString().slice(0, 10)
  let saved = 0, skipped = 0

  for (const b of benchmarks) {
    const canonName = normBenchmarkName(b.name)
    const benchmarkId = idByName.get(canonName.toLowerCase()) ?? idByName.get(b.name.toLowerCase())
    if (!benchmarkId) { skipped++; continue }

    const { error } = await supabase
      .from('model_benchmarks')
      .upsert(
        {
          model_id:         modelId,
          benchmark_id:     benchmarkId,
          score:            b.score,
          source:           b.source,
          tested_at:        today,
          confidence_score: b.confidence_score,
        },
        { onConflict: 'model_id,benchmark_id,tested_at,source' },
      )

    if (error) {
      console.warn('[scrape] benchmark upsert error:', error.message)
      skipped++
    } else {
      saved++
    }
  }

  return { saved, skipped }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const authError = await requireWriteAccess(request)
  if (authError) return authError
  const body = await request.json()
  const { url, modelName, company, modelId, saveToDb = false } = body as {
    url?: string
    modelName?: string
    company?: string
    modelId?: string
    /** When true AND modelId is provided, upsert extracted benchmarks to DB */
    saveToDb?: boolean
  }

  if (!url && !modelName) {
    return NextResponse.json({ error: 'url 或 modelName 必须提供其一' }, { status: 400 })
  }

  try {
    let extracted: ExtractedModel
    let mode: string
    let evidence: EvidenceMap = {}
    let fetchedUrls: string[] = []
    let failedUrls: string[] = []

    // ── Determine scrape mode ─────────────────────────────────────────────
    const hasRegistry = modelName ? !!getModelSources(modelName, company) : false
    const useMultiSource = hasRegistry || !!url

    if (useMultiSource) {
      mode = url ? 'multi-url' : 'multi-registry'
      const result = await fetchMultiSource(modelName ?? '', company, url)

      if (result.fetchedUrls.length === 0) {
        mode = 'knowledge'
        failedUrls = result.failedUrls  // ← preserve failed URLs even in fallback
        const content = `[模型名称查询模式]\n模型: ${modelName}\n公司: ${company ?? '未知'}\n\n请根据你训练数据中对该模型的已知信息进行提取，注意标注置信度。`
        extracted = await extractModelData(content, { name: modelName, company })
      } else {
        extracted = result.merged
        evidence = result.evidence
        fetchedUrls = result.fetchedUrls
        failedUrls = result.failedUrls
      }
    } else {
      mode = 'knowledge'
      const content = `[模型名称查询模式]\n模型: ${modelName}\n公司: ${company ?? '未知'}\n\n请根据你训练数据中对该模型的已知信息进行提取，注意标注置信度。`
      extracted = await extractModelData(content, { name: modelName, company })
    }

    // ── Official benchmark override ───────────────────────────────────────
    const targetName = extracted.name ?? modelName ?? ''
    const officialBenchmarks: Record<string, { score: number; sourceUrl: string }> = {}

    // Track which benchmarks came from which source for DB write
    const benchmarksToSave: BenchmarkToSave[] = []

    // Seed with LLM-extracted benchmarks (lowest priority)
    for (const b of extracted.benchmarks ?? []) {
      benchmarksToSave.push({
        name:             normBenchmarkName(b.name),
        score:            b.score,
        source:           'llm_extracted',
        confidence_score: 0.7,
      })
    }

    if (targetName) {
      try {
        const aaSlug = extractAASlug(targetName, company)
        const official = await getOfficialBenchmarks(targetName, aaSlug, company)

        // SWE-bench
        if (official.swe) {
          officialBenchmarks['SWE-bench'] = official.swe
          const idx = extracted.benchmarks.findIndex(b => b.name.toLowerCase().includes('swe'))
          if (idx >= 0) extracted.benchmarks[idx] = { name: 'SWE-bench', score: official.swe.score }
          else          extracted.benchmarks.push({ name: 'SWE-bench', score: official.swe.score })
          // Override / add in save list
          const si = benchmarksToSave.findIndex(b => b.name === 'SWE-bench')
          const entry = { name: 'SWE-bench', score: official.swe.score, source: 'official' as const, confidence_score: 1.0 }
          if (si >= 0) benchmarksToSave[si] = entry
          else         benchmarksToSave.push(entry)
        }

        // Arena ELO
        if (official.arena) {
          officialBenchmarks['Arena ELO'] = official.arena
          const idx = extracted.benchmarks.findIndex(b =>
            b.name.toLowerCase().includes('arena') || b.name.toLowerCase().includes('elo')
          )
          if (idx >= 0) extracted.benchmarks[idx] = { name: 'Arena ELO', score: official.arena.score }
          else          extracted.benchmarks.push({ name: 'Arena ELO', score: official.arena.score })
          const ai = benchmarksToSave.findIndex(b => b.name === 'Arena ELO')
          const entry = { name: 'Arena ELO', score: official.arena.score, source: 'official' as const, confidence_score: 1.0 }
          if (ai >= 0) benchmarksToSave[ai] = entry
          else         benchmarksToSave.push(entry)
        }

        // Artificial Analysis Quality Index
        if (official.aaQuality) {
          officialBenchmarks['AA Quality'] = official.aaQuality
          const idx = extracted.benchmarks.findIndex(b =>
            b.name.toLowerCase().includes('quality') || b.name.toLowerCase().includes('aa ')
          )
          if (idx >= 0) extracted.benchmarks[idx] = { name: 'AA Quality', score: official.aaQuality.score }
          else          extracted.benchmarks.push({ name: 'AA Quality', score: official.aaQuality.score })
          const qi = benchmarksToSave.findIndex(b => b.name === 'AA Quality')
          const entry = { name: 'AA Quality', score: official.aaQuality.score, source: 'official' as const, confidence_score: 1.0 }
          if (qi >= 0) benchmarksToSave[qi] = entry
          else         benchmarksToSave.push(entry)
        }
        // Epoch AI — fill in missing release_date / params / source_url
        if (official.epoch) {
          const ep = official.epoch
          if (!extracted.release_date && ep.publicationDate)
            extracted.release_date = ep.publicationDate
          if (!extracted.params && ep.params)
            extracted.params = ep.params
          if (!extracted.source_url && ep.sourceUrl)
            extracted.source_url = ep.sourceUrl
        }
      } catch (err) {
        console.warn('[scrape] getOfficialBenchmarks failed:', err)
      }
    }

    // Normalise all extracted benchmark names
    extracted.benchmarks = extracted.benchmarks.map(b => ({
      ...b,
      name: normBenchmarkName(b.name),
    }))

    // Filter out known Artificial Analysis site metrics that are not AI benchmarks
    const AA_NOISE_NAMES = new Set([
      'Artificial analysis intelligence index', 'Intelligence index', 'Quality index score',
      'Speed', 'Tokens per second', 'TPS', 'Verbosity',
      'Input price', 'Output price', 'Context window size',
    ])
    extracted.benchmarks = extracted.benchmarks.filter(b => !AA_NOISE_NAMES.has(b.name))

    // Deduplicate by name (last write wins — official overrides LLM)
    const deduped = new Map<string, { name: string; score: number }>()
    for (const b of extracted.benchmarks) deduped.set(b.name, b)
    extracted.benchmarks = [...deduped.values()]

    // ── Diff against existing DB record ──────────────────────────────────
    let diff: Record<string, { old: any; new: any }> | undefined
    if (modelId) {
      const supabase = createServerClient()
      const { data: existing } = await supabase
        .from('models')
        .select('id, name, params, context_window, license, architecture, innovation')
        .eq('id', modelId)
        .single()
      if (existing) diff = computeDiff(existing, extracted)
    }

    // ── Persist benchmarks to DB if requested ────────────────────────────
    let benchmarkSaveResult: { saved: number; skipped: number } | undefined
    if (saveToDb && modelId && benchmarksToSave.length > 0) {
      const supabase = createServerClient()
      benchmarkSaveResult = await saveBenchmarks(supabase, modelId, benchmarksToSave)
    }

    return NextResponse.json({
      extracted,
      diff,
      warnings:           buildWarnings(extracted, mode, failedUrls, !!url),
      mode,
      officialBenchmarks,
      evidence,
      fetchedUrls,
      failedUrls,
      validation:         validateExtracted(extracted),
      ...(benchmarkSaveResult ? { benchmarkSaveResult } : {}),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Scrape failed' }, { status: 500 })
  }
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDiff(existing: Record<string, any>, extracted: ExtractedModel) {
  const fieldMap: Record<string, keyof ExtractedModel> = {
    name: 'name', params: 'params', context_window: 'context_window',
    license: 'license', architecture: 'architecture', innovation: 'innovation',
  }
  const diff: Record<string, { old: any; new: any }> = {}
  for (const [dbKey, extKey] of Object.entries(fieldMap)) {
    const oldVal = existing[dbKey]
    const newVal = extracted[extKey]
    if (newVal !== null && String(oldVal ?? '') !== String(newVal)) {
      diff[dbKey] = { old: oldVal ?? null, new: newVal }
    }
  }
  if (extracted.input_price !== null) {
    const oldIn = existing.pi ?? existing.input_price ?? null
    if (oldIn !== extracted.input_price) diff.input_price = { old: oldIn, new: extracted.input_price }
  }
  if (extracted.output_price !== null) {
    const oldOut = existing.po ?? existing.output_price ?? null
    if (oldOut !== extracted.output_price) diff.output_price = { old: oldOut, new: extracted.output_price }
  }
  return diff
}

function buildWarnings(e: ExtractedModel, mode: string, failedUrls: string[], urlProvided: boolean): string[] {
  const warnings: string[] = []
  if (mode === 'knowledge') {
    if (urlProvided && failedUrls.length > 0) {
      warnings.push('⚠ 提供的 URL 抓取失败，已退回 LLM 知识模式，信息可能不是最新版本')
    } else if (urlProvided) {
      warnings.push('⚠ URL 无法访问，已退回 LLM 知识模式，信息可能不是最新版本')
    } else {
      warnings.push('⚠ 无URL：使用 Claude 训练数据，信息可能不是最新版本')
    }
  }
  if (failedUrls.length > 0) warnings.push(`${failedUrls.length} 个来源抓取失败`)
  const lowFields = Object.entries(e.confidence ?? {}).filter(([, v]) => v === 'low').map(([k]) => k)
  if (lowFields.length) warnings.push(`低置信度字段: ${lowFields.join(', ')}`)
  if (!e.release_date) warnings.push('未找到发布日期')
  if (!e.input_price && !e.output_price) warnings.push('未找到定价信息')
  if (!e.benchmarks?.length) warnings.push('未找到 benchmark 数据')
  return warnings
}
