/**
 * Multi-source Fetcher — parallel URL fetching with field-level evidence.
 *
 * Flow:
 *  1. Get URL list from Source Registry for the target model.
 *  2. Fetch all URLs in parallel (with individual timeout / error isolation).
 *  3. Run LLM extraction on each fetched page.
 *  4. Merge results: for each field, keep the value from the highest-priority
 *     source that returned a non-null value, and record the source URL.
 *
 * The output includes an `evidence` map so the ScrapeModal can show exactly
 * which URL each field came from.
 */

import { extractModelData, ExtractedModel } from './extractor'
import { getModelSources } from './source_registry'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EvidenceLevel = 'official' | 'huggingface' | 'arxiv' | 'generated'

export interface FieldEvidence {
  value: any
  sourceUrl: string
  evidenceLevel: EvidenceLevel
  confidence: 'high' | 'medium' | 'low'
}

export type EvidenceMap = Partial<Record<keyof ExtractedModel, FieldEvidence>>

export interface MultiSourceResult {
  merged: ExtractedModel
  evidence: EvidenceMap
  /** URLs that were fetched successfully */
  fetchedUrls: string[]
  /** URLs that failed (timeout / 4xx / 5xx) */
  failedUrls: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 14_000

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 14_000)
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ModelTrack/1.0)',
        Accept: 'text/html,text/plain',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn(`[MultiSource] ${url} → HTTP ${res.status}`)
      return null
    }
    const ct = res.headers.get('content-type') ?? ''
    const raw = await res.text()
    const content = ct.includes('html') ? stripHtml(raw) : raw.slice(0, 14_000)
    if (content.length < 100) {
      console.warn(`[MultiSource] ${url} → content too short (${content.length} chars), skipping`)
      return null
    }
    return content
  } catch (err: any) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message ?? 'network error')
    console.warn(`[MultiSource] ${url} → ${reason}`)
    return null
  }
}

function classifyUrl(url: string): EvidenceLevel {
  if (url.includes('huggingface.co')) return 'huggingface'
  if (url.includes('arxiv.org'))      return 'arxiv'
  // Official company domains
  const officialDomains = [
    'anthropic.com', 'openai.com', 'deepmind.google', 'ai.google.dev',
    'blog.google', 'ai.meta.com', 'mistral.ai', 'deepseek.com',
    'x.ai', 'qwenlm.github.io', 'minimaxi.com', 'moonshot.cn',
    'zhipuai.cn', 'platform.deepseek.com',
  ]
  if (officialDomains.some(d => url.includes(d))) return 'official'
  return 'generated'
}

// Scalar fields that can be cleanly merged (first non-null wins)
const SCALAR_FIELDS: (keyof ExtractedModel)[] = [
  'name', 'company', 'release_date', 'params', 'context_window',
  'license', 'architecture', 'innovation', 'input_price', 'output_price',
]

// ─── Core merge logic ─────────────────────────────────────────────────────────

/**
 * Merge multiple ExtractedModel results from different sources.
 * Priority: official > huggingface > arxiv > generated.
 * For each field, the first (highest-priority) non-null value wins.
 */
function mergeResults(
  results: Array<{ extracted: ExtractedModel; url: string; level: EvidenceLevel }>
): { merged: ExtractedModel; evidence: EvidenceMap } {
  // Sort: official first, then huggingface, arxiv, generated
  const priority: EvidenceLevel[] = ['official', 'huggingface', 'arxiv', 'generated']
  const sorted = [...results].sort(
    (a, b) => priority.indexOf(a.level) - priority.indexOf(b.level)
  )

  // Start with the highest-priority result as the base
  const base = sorted[0]?.extracted ?? ({} as ExtractedModel)
  const merged: ExtractedModel = { ...base }
  const evidence: EvidenceMap = {}

  // Scalar fields: fill from highest-priority source that has a value
  for (const field of SCALAR_FIELDS) {
    for (const { extracted, url, level } of sorted) {
      const val = extracted[field]
      if (val !== null && val !== undefined && val !== '') {
        merged[field] = val as never
        evidence[field] = {
          value: val,
          sourceUrl: url,
          evidenceLevel: level,
          confidence: extracted.confidence?.[field as string] ?? 'medium',
        }
        break
      }
    }
  }

  // modalities: union of all sources (text/vision/audio/code)
  const allModalities = new Set<string>()
  for (const { extracted } of sorted) {
    for (const m of extracted.modalities ?? []) allModalities.add(m)
  }
  if (allModalities.size > 0) {
    merged.modalities = [...allModalities]
    const best = sorted.find(r => (r.extracted.modalities?.length ?? 0) > 0)
    if (best) {
      evidence.modalities = {
        value: merged.modalities,
        sourceUrl: best.url,
        evidenceLevel: best.level,
        confidence: best.extracted.confidence?.modalities ?? 'medium',
      }
    }
  }

  // benchmarks: merge by name (official source takes precedence for each benchmark)
  const benchMap = new Map<string, { score: number; url: string; level: EvidenceLevel }>()
  // Add in reverse priority order so higher-priority overwrites
  for (const { extracted, url, level } of [...sorted].reverse()) {
    for (const b of extracted.benchmarks ?? []) {
      benchMap.set(b.name.toLowerCase(), { score: b.score, url, level })
    }
  }
  merged.benchmarks = [...benchMap.entries()].map(([name, { score }]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    score,
  }))

  // confidence: take maximum confidence per field
  const confPriority = { high: 3, medium: 2, low: 1 }
  const mergedConf: Record<string, 'high' | 'medium' | 'low'> = {}
  for (const { extracted } of sorted) {
    for (const [key, val] of Object.entries(extracted.confidence ?? {})) {
      const cur = mergedConf[key]
      if (!cur || confPriority[val] > confPriority[cur]) {
        mergedConf[key] = val
      }
    }
  }
  merged.confidence = mergedConf

  return { merged, evidence }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a model's data from multiple authoritative sources in parallel.
 * Falls back gracefully to single-source if registry has no entry.
 */
export async function fetchMultiSource(
  modelName: string,
  company?: string,
  userUrl?: string,
): Promise<MultiSourceResult> {
  const sourceEntry = getModelSources(modelName, company)

  // Build ordered URL list:
  // userUrl (if provided) > primary > pricing > docs > huggingface > arxiv > evals
  // evals (Artificial Analysis, Open LLM Leaderboard, LiveBench) are included for
  // benchmark data extraction — they have the richest score tables per model.
  const urlPlan: string[] = []
  if (userUrl) urlPlan.push(userUrl)
  if (sourceEntry) {
    urlPlan.push(...sourceEntry.primary)
    urlPlan.push(...sourceEntry.pricing)
    if (sourceEntry.docs)        urlPlan.push(...sourceEntry.docs)
    if (sourceEntry.huggingface) urlPlan.push(...sourceEntry.huggingface)
    if (sourceEntry.arxiv)       urlPlan.push(...sourceEntry.arxiv)
    if (sourceEntry.evals)       urlPlan.push(...sourceEntry.evals)
  }

  // Deduplicate
  const uniqueUrls = [...new Set(urlPlan)]

  if (uniqueUrls.length === 0) {
    // No URLs at all — return empty result, caller falls back to LLM knowledge
    const empty: ExtractedModel = {
      name: modelName, company: company ?? null,
      release_date: null, params: null, context_window: null,
      license: null, modalities: [], architecture: null, innovation: null,
      benchmarks: [], input_price: null, output_price: null,
      source_url: null, confidence: {},
    }
    return { merged: empty, evidence: {}, fetchedUrls: [], failedUrls: [] }
  }

  // Parallel fetch — cap at 4 concurrent to be polite
  const MAX_PARALLEL = 4
  const urlBatches: string[][] = []
  for (let i = 0; i < uniqueUrls.length; i += MAX_PARALLEL) {
    urlBatches.push(uniqueUrls.slice(i, i + MAX_PARALLEL))
  }

  const fetchResults: Array<{ url: string; content: string | null }> = []
  for (const batch of urlBatches) {
    const batchResults = await Promise.all(
      batch.map(async url => ({ url, content: await safeFetch(url) }))
    )
    fetchResults.push(...batchResults)
  }

  const fetchedUrls = fetchResults.filter(r => r.content !== null).map(r => r.url)
  const failedUrls  = fetchResults.filter(r => r.content === null).map(r => r.url)

  if (fetchedUrls.length === 0) {
    // All fetches failed — return empty
    const empty: ExtractedModel = {
      name: modelName, company: company ?? null,
      release_date: null, params: null, context_window: null,
      license: null, modalities: [], architecture: null, innovation: null,
      benchmarks: [], input_price: null, output_price: null,
      source_url: null, confidence: {},
    }
    return { merged: empty, evidence: {}, fetchedUrls: [], failedUrls }
  }

  // Run LLM extraction on each fetched page in parallel
  const extractionResults = await Promise.allSettled(
    fetchResults
      .filter(r => r.content !== null)
      .map(async ({ url, content }) => {
        const extracted = await extractModelData(content!, { name: modelName, company })
        return { extracted, url, level: classifyUrl(url) }
      })
  )

  const successful = extractionResults
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ extracted: ExtractedModel; url: string; level: EvidenceLevel }>).value)

  if (successful.length === 0) {
    const empty: ExtractedModel = {
      name: modelName, company: company ?? null,
      release_date: null, params: null, context_window: null,
      license: null, modalities: [], architecture: null, innovation: null,
      benchmarks: [], input_price: null, output_price: null,
      source_url: null, confidence: {},
    }
    return { merged: empty, evidence: {}, fetchedUrls, failedUrls }
  }

  const { merged, evidence } = mergeResults(successful)
  // source_url should always point to the official primary announcement page,
  // not the first fetched URL (which might be a pricing page).
  if (!merged.source_url) {
    merged.source_url = sourceEntry?.primary[0] ?? fetchedUrls[0]
  }

  return { merged, evidence, fetchedUrls, failedUrls }
}
