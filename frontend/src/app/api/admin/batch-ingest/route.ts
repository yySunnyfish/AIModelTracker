import { NextResponse } from 'next/server'
import { requireAdminAccess } from '@/lib/route_auth'
/**
 * POST /api/admin/batch-ingest
 *
 * Streams ingest progress via SSE (text/event-stream).
 * For each candidate model, runs the full scrape + create pipeline:
 *   1. fetchMultiSource + extractModelData  — multi-source fetch + LLM extraction
 *   2. writeToDb — models + benchmarks + price_history
 *                  + model_capability_scores (6-dim)
 *                  + model_rich_profiles (capabilities/applications/impact)
 *
 * Body: { candidates: CandidateModel[]; dryRun?: boolean }
 *
 * SSE event stream:
 *   data: { type: 'progress', result: IngestResult }   — one per model
 *   data: { type: 'done', created, dry_run, failed }
 */

import { extractModelData, ExtractedModel } from '@/lib/extractor'
import { fetchMultiSource } from '@/lib/multi_source_fetcher'
import { getModelSources } from '@/lib/source_registry'
import { getOfficialBenchmarks } from '@/lib/benchmark_scrapers'
import { normBenchmarkName } from '@/lib/benchmark_scrapers'
import { validateExtracted } from '@/lib/field_validator'
import { createServerClient } from '@/lib/supabase'
import { applyCanonicalSpecs } from '@/data/model_specs'
import type { CandidateModel } from '@/lib/company_discovery'
import { enrichFromOpenRouter } from '@/lib/openrouter_enricher'
import { getBenchmarkIdMap } from '@/lib/benchmark_seeder'

// Increase route timeout for long scrape batches (Next.js / Vercel)
export const maxDuration = 300

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DimScores {
  coding?:        number
  agentic?:       number
  multimodal?:    number
  reasoning?:     number
  math?:          number
  hallucination?: number
}

export interface IngestResult {
  name:      string
  company:   string
  status:    'created' | 'skipped' | 'failed' | 'dry_run'
  modelId?:  string
  error?:    string
  extracted?: Pick<ExtractedModel,
    'release_date' | 'params' | 'context_window' | 'license' |
    'input_price' | 'output_price' | 'benchmarks' | 'source_url' | 'modalities' |
    'architecture' | 'innovation'>
  dimScores?: DimScores
  warnings?: string[]
}

// ─── data_source enum mapping ──────────────────────────────────────────────────

type DbDataSource =
  | 'official_blog' | 'huggingface' | 'openrouter' | 'epoch_ai'
  | 'artificial_analysis' | 'techcrunch' | 'media_36kr' | 'media_other' | 'manual'

function toDbDataSource(source: CandidateModel['source']): DbDataSource {
  if (source === 'huggingface') return 'huggingface'
  if (source === 'epoch')       return 'epoch_ai'
  return 'official_blog'
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function diffMonths(a: string, b: string): number {
  const da = new Date(a), db = new Date(b)
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
}

/** Derive which DB category best describes the model */
function deriveCategory(name: string, modalities: string[]): string {
  const n = name.toLowerCase()
  if (modalities.some(m => ['vision', 'image', 'video'].some(v => m.toLowerCase().includes(v))))
    return 'multimodal'
  if (/\b(r\d|reason|think|o\d)\b/.test(n) || n.endsWith('-r1') || n.endsWith(' r1'))
    return 'reasoning'
  if (/\b(code|coder|codegen|dev)\b/.test(n))
    return 'coding'
  return 'general'
}

/** Derive 6-dim capability scores from extracted benchmark data */
function deriveDimScores(extracted: ExtractedModel): DimScores {
  const bms = extracted.benchmarks ?? []
  const get = (...names: string[]): number | undefined => {
    for (const n of names) {
      const b = bms.find(bm => bm.name.toLowerCase().includes(n.toLowerCase()))
      if (b?.score != null) return Math.round(b.score)
    }
    return undefined
  }

  const scores: DimScores = {}

  const coding = get('swe-bench', 'swebench', 'humaneval', 'human eval')
  if (coding    != null) scores.coding    = coding

  const reasoning = get('mmlu', 'gpqa')
  if (reasoning   != null) scores.reasoning = reasoning

  const math = get('math-500', 'math500', 'aime', 'gsm8k', 'math')
  if (math        != null) scores.math      = math

  const hallucination = get('truthfulqa', 'truthful qa', 'simpleqa')
  if (hallucination != null) scores.hallucination = hallucination

  // agentic: normalize Arena ELO (typical range 900-1500) → 0-100
  const arenaElo = get('arena elo', 'arena', 'chatbot arena', 'elo')
  if (arenaElo != null && arenaElo > 100) {
    scores.agentic = Math.max(0, Math.min(100, Math.round((arenaElo - 900) / 7)))
  }

  // multimodal: non-zero from MMMU/visual QA, or 0 for confirmed text-only
  const mmmu = get('mmmu', 'visual qa', 'aa quality')
  if (mmmu != null) {
    scores.multimodal = mmmu
  } else {
    const modalities = extracted.modalities ?? ['text']
    const isTextOnly = !modalities.some(m =>
      ['vision', 'image', 'video', 'audio'].some(v => m.toLowerCase().includes(v)),
    )
    if (isTextOnly) scores.multimodal = 0
  }

  return scores
}

// ─── Per-model scrape ──────────────────────────────────────────────────────────

async function scrapeOne(
  candidate: CandidateModel,
): Promise<{ extracted: ExtractedModel; warnings: string[] }> {
  const { name, company } = candidate
  const userUrl = candidate.sourceUrl ?? undefined

  const hasRegistry = !!getModelSources(name, company ?? undefined)
  let extracted: ExtractedModel
  let warnings: string[] = []

  if (hasRegistry || userUrl) {
    const result = await fetchMultiSource(name, company ?? undefined, userUrl)

    if (result.fetchedUrls.length > 0) {
      extracted = result.merged
    } else {
      warnings.push('⚠ URL 抓取失败，使用 LLM 知识模式')
      const content = `[模型名称查询模式]\n模型: ${name}\n公司: ${company ?? '未知'}`
      extracted = await extractModelData(content, { name, company: company ?? undefined })
    }

    if (candidate.releaseDate && !extracted.release_date)
      extracted.release_date = candidate.releaseDate
    if (candidate.params && !extracted.params)
      extracted.params = candidate.params
    if (candidate.sourceUrl && !extracted.source_url)
      extracted.source_url = candidate.sourceUrl

    try {
      const official = await getOfficialBenchmarks(name, undefined, company ?? undefined)
      if (official.swe) {
        const idx = extracted.benchmarks.findIndex(b => b.name.toLowerCase().includes('swe'))
        const entry = { name: 'SWE-bench', score: official.swe.score }
        if (idx >= 0) extracted.benchmarks[idx] = entry
        else extracted.benchmarks.push(entry)
      }
      if (official.arena) {
        const entry = { name: 'Arena ELO', score: official.arena.score }
        const idx = extracted.benchmarks.findIndex(b =>
          b.name.toLowerCase().includes('arena') || b.name.toLowerCase().includes('elo'))
        if (idx >= 0) extracted.benchmarks[idx] = entry
        else extracted.benchmarks.push(entry)
      }
      if (official.epoch) {
        const ep = official.epoch
        if (!extracted.release_date && ep.publicationDate)
          extracted.release_date = ep.publicationDate
        if (!extracted.params && ep.params)
          extracted.params = ep.params
        if (!extracted.source_url && ep.sourceUrl)
          extracted.source_url = ep.sourceUrl
      }
    } catch { /* non-fatal */ }

  } else {
    warnings.push('⚠ 无注册 URL，使用 LLM 知识模式')
    const content = `[模型名称查询模式]\n模型: ${name}\n公司: ${company ?? '未知'}`
    extracted = await extractModelData(content, { name, company: company ?? undefined })
    if (candidate.releaseDate && !extracted.release_date)
      extracted.release_date = candidate.releaseDate
    if (candidate.params && !extracted.params)
      extracted.params = candidate.params
  }

  extracted.benchmarks = extracted.benchmarks.map(b => ({
    ...b, name: normBenchmarkName(b.name),
  }))

  // ── OpenRouter enrichment — fills pricing + context_window gaps ────────────
  try {
    const or = await enrichFromOpenRouter(name, company ?? '')
    if (or) {
      if (!extracted.context_window)  extracted.context_window  = or.context_window
      if (!extracted.input_price)     extracted.input_price     = or.input_price_per_million
      if (!extracted.output_price)    extracted.output_price    = or.output_price_per_million
      warnings.push(`✓ OpenRouter: ${or.or_model_id} ctx=${or.context_window} $${or.input_price_per_million}/$${or.output_price_per_million}/M`)
    }
  } catch { /* non-fatal */ }

  // ── Date sanity: prefer candidate.releaseDate when extraction gave old date ─
  if (candidate.releaseDate) {
    // Use candidate date if extraction date is missing OR more than 6 months older
    const cDate = candidate.releaseDate
    const eDate = extracted.release_date
    if (!eDate || (eDate < cDate && diffMonths(eDate, cDate) > 6)) {
      extracted.release_date = cDate
    }
  }

  // ── HF license: parse from tags when source is huggingface ────────────────
  if (candidate.source === 'huggingface' && candidate.sourceUrl && !extracted.license) {
    try {
      const hfId = candidate.sourceUrl.replace('https://huggingface.co/', '')
      const res  = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(hfId)}?full=false`, {
        headers: { 'User-Agent': 'ModelTrack/1.0' },
        signal:  AbortSignal.timeout(6_000),
      })
      if (res.ok) {
        const meta = await res.json()
        const licTag = (meta.tags ?? []).find((t: string) => t.startsWith('license:'))
        if (licTag) {
          const lic = licTag.replace('license:', '').toLowerCase()
          const licMapped = (
            lic === 'mit' || lic === 'apache-2.0' || lic === 'apache2' ? 'open' :
            lic.includes('llama') || lic.includes('gemma') || lic.includes('qwen') ? 'partial' :
            lic === 'other' ? null :
            'open'
          ) as 'open' | 'partial' | null
          if (licMapped) extracted.license = licMapped
        }
        // HF params count from safetensors metadata
        if (!extracted.params) {
          const total = meta.safetensors?.total
          if (total && typeof total === 'number') {
            const b = total / 1e9
            extracted.params = b >= 1000 ? `${(b/1000).toFixed(1)}T` : `${Math.round(b)}B`
          }
        }
      }
    } catch { /* non-fatal */ }
  }

  const validation = validateExtracted(extracted)
  const validationErrors = Object.entries(validation)
    .filter(([, v]) => (v as any)?.status === 'error')
    .map(([k, v]) => `${k}: ${(v as any).message}`)
  if (validationErrors.length) {
    warnings.push(...validationErrors.map(e => `验证: ${e}`))
  }

  return { extracted, warnings }
}

// ─── Rich profile derivation ──────────────────────────────────────────────────

interface RichProfile {
  capabilities:   string[]
  applications:   string[]
  impact_tags:    string[]
  impact_summary: string
}

function deriveRichProfile(extracted: ExtractedModel, candidate: CandidateModel): RichProfile {
  const name      = (extracted.name ?? candidate.name ?? '').toLowerCase()
  const mods      = extracted.modalities ?? ['text']
  const category  = deriveCategory(extracted.name ?? candidate.name ?? '', mods)
  const isOpen    = extracted.license === 'open'
  const hasVision = mods.some(m => ['vision', 'image'].includes(m.toLowerCase()))
  const hasAudio  = mods.some(m => m.toLowerCase() === 'audio')
  const hasImgGen = mods.some(m => m.toLowerCase() === 'image-gen')
  const bms       = (extracted.benchmarks ?? []).map(b => b.name.toLowerCase())
  const hasMath   = bms.some(b => b.includes('math') || b.includes('aime') || b.includes('gsm'))
  const hasSWE    = bms.some(b => b.includes('swe') || b.includes('humaneval'))

  const capabilities: string[] = []
  if (hasSWE || category === 'coding')        capabilities.push('Code Generation')
  if (category === 'reasoning')               capabilities.push('Chain-of-thought Reasoning')
  if (hasMath)                                capabilities.push('Math & Data Analysis')
  if (hasVision)                              capabilities.push('Visual Understanding')
  if (hasAudio)                               capabilities.push('Audio Processing')
  if (hasImgGen)                              capabilities.push('Image Generation')
  if (name.includes('agent') || category === 'general') capabilities.push('Agentic Tasks')
  capabilities.push('Text Generation', 'Instruction Following')

  const applications: string[] = []
  if (category === 'coding')     applications.push('Software Development', 'Code Review & Debug')
  if (category === 'reasoning')  applications.push('Research Assistant', 'Complex Analysis')
  if (hasVision)                 applications.push('Document Understanding', 'Visual Q&A')
  applications.push('Chatbot', 'Content Creation', 'Data Analysis')

  const impact_tags: string[] = []
  if (isOpen)              impact_tags.push('Open-source')
  if (category === 'reasoning')   impact_tags.push('Reasoning Model')
  if (category === 'multimodal')  impact_tags.push('Multimodal')
  if ((extracted.params ?? '').match(/^\d+T/)) impact_tags.push('Large Scale')
  impact_tags.push(candidate.company ?? 'AI Model')

  const impact_summary = extracted.innovation
    ?? `${extracted.name ?? candidate.name} is a ${category} AI model by ${candidate.company ?? 'unknown'}.`

  return { capabilities, applications, impact_tags, impact_summary }
}

// ─── DB write ──────────────────────────────────────────────────────────────────

async function writeToDb(
  extracted: ExtractedModel,
  candidate: CandidateModel,
  dimScores: DimScores,
): Promise<{ modelId: string }> {
  const body = applyCanonicalSpecs(extracted as any)
  const supabase = createServerClient()

  // Find or create company
  let companyId: string | null = null
  if (body.company) {
    const { data: existing } = await supabase
      .from('companies').select('id').ilike('name', body.company.trim()).single()
    if (existing) {
      companyId = existing.id
    } else {
      const { data: created, error } = await supabase
        .from('companies')
        .insert({ name: body.company.trim(), region: 'OTHER', type: 'LLM' })
        .select('id').single()
      if (error) throw new Error(`Company create failed: ${error.message}`)
      companyId = created.id
    }
  }

  // Insert model
  const mods = body.modalities ?? ['text']
  const { data: model, error: mErr } = await supabase
    .from('models')
    .insert({
      company_id:       companyId,
      name:             body.name ?? 'Unknown',
      category:         deriveCategory(body.name ?? '', mods),
      license:          body.license ?? 'closed',
      release_date:     body.release_date ?? new Date().toISOString().slice(0, 10),
      params:           body.params,
      context_window:   body.context_window,
      modalities:       mods,
      architecture:     body.architecture,
      innovation:       body.innovation,
      source_url:       body.source_url,
      data_source:      toDbDataSource(candidate.source),
      confidence_score: 0.75,
    })
    .select('id').single()

  if (mErr) throw new Error(mErr.message)
  const modelId = model.id

  // Benchmarks — use seeded + cached benchmark id map
  const idByName = await getBenchmarkIdMap()
  const today = new Date().toISOString().slice(0, 10)

  for (const bm of body.benchmarks ?? []) {
    const bmId = idByName.get(bm.name.toLowerCase()) ?? idByName.get(normBenchmarkName(bm.name).toLowerCase())
    if (!bmId) continue
    await supabase.from('model_benchmarks').upsert(
      { model_id: modelId, benchmark_id: bmId, score: bm.score,
        source: 'llm_extracted', tested_at: today, confidence_score: 0.7 },
      { onConflict: 'model_id,benchmark_id' },
    )
  }

  // Price history
  if (body.input_price != null && body.output_price != null) {
    await supabase.from('price_history').insert({
      model_id:                 modelId,
      input_price_per_million:  body.input_price,
      output_price_per_million: body.output_price,
      effective_from:           today,
      source:                   toDbDataSource(candidate.source),
    })
  }

  // Capability scores (6-dim) — single-row upsert
  const hasAnyScore = Object.values(dimScores).some(v => v != null)
  if (hasAnyScore) {
    await supabase.from('model_capability_scores').upsert({
      model_id:     modelId,
      coding:       dimScores.coding        ?? null,
      agentic:      dimScores.agentic       ?? null,
      multimodal:   dimScores.multimodal    ?? null,
      reasoning:    dimScores.reasoning     ?? null,
      math:         dimScores.math          ?? null,
      hallucination:dimScores.hallucination ?? null,
      source:       'llm_extracted',
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'model_id' })
  }

  // Rich profile (capabilities / applications / impact)
  const profile = deriveRichProfile(extracted, candidate)
  await supabase.from('model_rich_profiles').upsert({
    model_id:       modelId,
    capabilities:   profile.capabilities,
    applications:   profile.applications,
    impact_tags:    profile.impact_tags,
    impact_summary: profile.impact_summary,
    source:         'auto_derived',
    updated_at:     new Date().toISOString(),
  }, { onConflict: 'model_id' })

  return { modelId }
}

// ─── Code snippet generation ───────────────────────────────────────────────────
// (kept for source_registry only — model_specs/model_scores are now DB-driven)

function buildCodeSnippets(results: IngestResult[]) {
  const created = results.filter(r => r.status === 'created' || r.status === 'dry_run')
  const regLines = created.map(r => {
    const slug = r.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    return `  '${r.name}': {\n    primary:  ['https://FILL_ME/${slug}'],\n    pricing:  ['https://FILL_ME/pricing'],\n  },`
  })
  return {
    source_registry: `// ── Add to MODEL_SOURCES in src/lib/source_registry.ts ──\n${regLines.join('\n')}`,
  }
}

// ─── Route handler (SSE streaming) ────────────────────────────────────────────

export async function POST(request: Request) {
  const authError = requireAdminAccess(request)
  if (authError) return authError
  const body = await request.json() as {
    candidates: CandidateModel[]
    dryRun?: boolean
  }
  const { candidates, dryRun = false } = body

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return new Response(
      JSON.stringify({ error: 'candidates array required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const batch = candidates.slice(0, 20)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const results: IngestResult[] = []

      for (const candidate of batch) {
        const { name, company } = candidate
        try {
          const { extracted, warnings } = await scrapeOne(candidate)

          const dimScores = deriveDimScores(extracted)

          const resultBase: Omit<IngestResult, 'status' | 'modelId'> = {
            name,
            company: company ?? '',
            extracted: {
              release_date:   extracted.release_date,
              params:         extracted.params,
              context_window: extracted.context_window,
              license:        extracted.license,
              input_price:    extracted.input_price,
              output_price:   extracted.output_price,
              benchmarks:     extracted.benchmarks,
              source_url:     extracted.source_url,
              modalities:     extracted.modalities,
              architecture:   extracted.architecture,
              innovation:     extracted.innovation,
            },
            dimScores,
            warnings,
          }

          let result: IngestResult
          if (dryRun) {
            result = { ...resultBase, status: 'dry_run' }
          } else {
            const { modelId } = await writeToDb(extracted, candidate, dimScores)
            result = { ...resultBase, status: 'created', modelId }
          }

          results.push(result)
          send({ type: 'progress', result })

        } catch (err: any) {
          const result: IngestResult = {
            name,
            company: company ?? '',
            status: 'failed',
            error:  err?.message ?? 'Unknown error',
          }
          results.push(result)
          send({ type: 'progress', result })
        }
      }

      const codeSnippets = buildCodeSnippets(results)
      send({
        type:     'done',
        created:  results.filter(r => r.status === 'created').length,
        dry_run:  results.filter(r => r.status === 'dry_run').length,
        failed:   results.filter(r => r.status === 'failed').length,
        total:    results.length,
        codeSnippets,
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
