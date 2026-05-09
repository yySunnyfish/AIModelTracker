/**
 * OpenRouter enricher — resolves pricing and context_length for any model
 * by querying the public OpenRouter models API (no auth required).
 *
 * https://openrouter.ai/api/v1/models
 * Each entry: { id, name, context_length, pricing: { prompt, completion } }
 *
 * Pricing is per-token; we multiply × 1 000 000 to get $/M tokens.
 * context_length is an integer (tokens); we convert to human format (128k, 1M …).
 */

const OR_API_URL  = 'https://openrouter.ai/api/v1/models'
const OR_CACHE_MS = 2 * 60 * 60 * 1000   // 2 hours

interface ORModel {
  id:             string   // "openai/gpt-4o"
  name:           string   // "GPT-4o"
  context_length: number
  pricing: {
    prompt:     string   // per token, e.g. "0.0000025"
    completion: string
  }
}

interface ORCache {
  models:    ORModel[]
  fetchedAt: number
}

// Module-level cache
let _cache: ORCache | null = null

async function getOrModels(): Promise<ORModel[]> {
  if (_cache && Date.now() - _cache.fetchedAt < OR_CACHE_MS) {
    return _cache.models
  }
  try {
    const res = await fetch(OR_API_URL, {
      headers: { 'User-Agent': 'ModelTrack/1.0' },
      signal:  AbortSignal.timeout(10_000),
    })
    if (!res.ok) return _cache?.models ?? []
    const data = await res.json()
    const models: ORModel[] = data.data ?? []
    _cache = { models, fetchedAt: Date.now() }
    return models
  } catch {
    return _cache?.models ?? []
  }
}

// ─── Name normalisation ────────────────────────────────────────────────────────

/** Strip non-alphanumeric → compact slug for exact-ish comparison */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Strips common suffixes + normalises to lowercase alphanumeric tokens */
function normTokens(s: string): string[] {
  const NOISE = new Set([
    'instruct', 'chat', 'it', 'preview', 'latest', 'turbo', 'fast',
    'thinking', 'reasoning', 'lite', 'nano',
    'base', 'online',
  ])
  // Replace separators with spaces but keep digit runs together
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t =>
      t &&
      !NOISE.has(t) &&
      !/^\d{4,}$/.test(t) &&   // drop year-like stamps (2026, 0905…)
      !/^\d$/.test(t),          // drop single digits
    )
}

/** Count how many tokens in `query` appear in `target` */
function tokenOverlap(query: string[], target: string[]): number {
  const set = new Set(target)
  return query.filter(t => set.has(t)).length
}

/** Slug similarity ratio: length of longest common substring / max(len) */
function slugSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  // LCS length via DP
  const m = a.length, n = b.length
  let maxLen = 0
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
        maxLen = Math.max(maxLen, dp[i][j])
      }
    }
  }
  return maxLen / Math.max(m, n)
}

/** Convert raw token count (e.g. 131072) → human string ("128k", "1M") */
export function fmtContextLen(n: number): string {
  if (n >= 900_000) return `${Math.round(n / 1_000_000)}M`
  const k = Math.round(n / 1024)
  if (k >= 1000) return `${(k / 1000).toFixed(1).replace('.0', '')}M`
  return `${k}k`
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface OREnrichResult {
  context_length:          number          // raw token count
  context_window:          string          // "128k", "1M" …
  input_price_per_million: number          // $/M input tokens
  output_price_per_million: number         // $/M output tokens
  or_model_id:             string          // "openai/gpt-4o"
}

/**
 * Finds the best-matching OpenRouter model for a given name + company.
 * Returns null if no good match found (overlap score < 0.5).
 *
 * Matching strategy:
 *  1. Exact org-slug + model-slug match
 *  2. Company prefix filter → best token overlap on remainder
 *  3. Global best token overlap
 */
export async function enrichFromOpenRouter(
  name:    string,
  company: string,
): Promise<OREnrichResult | null> {
  const models = await getOrModels()
  if (models.length === 0) return null

  const qTokens = normTokens(name)
  if (qTokens.length === 0) return null
  const qSlug = slugify(name)

  // Map canonical company → expected OR org prefix(es)
  const companyToOrg: Record<string, string[]> = {
    'openai':         ['openai'],
    'anthropic':      ['anthropic'],
    'google deepmind':['google', 'google-gemini'],
    'google':         ['google'],
    'meta':           ['meta-llama', 'meta'],
    'deepseek':       ['deepseek'],
    'alibaba':        ['qwen', 'alibaba'],
    'alibaba / qwen': ['qwen', 'alibaba'],
    'minimax':        ['minimax', 'minmaxai', 'minimaxai'],
    'moonshot ai':    ['moonshotai'],
    'moonshot':       ['moonshotai'],
    'zhipu ai':       ['thudm'],
    'xai':            ['x-ai', 'xai'],
    'mistral ai':     ['mistralai', 'mistral'],
    'mistral':        ['mistralai', 'mistral'],
    'amazon':         ['amazon'],
    'nvidia':         ['nvidia'],
    'cohere':         ['cohere'],
    'ai21':           ['ai21'],
  }
  const orgPrefixes = companyToOrg[company.toLowerCase()] ?? []

  // Score each OR model
  type Scored = { model: ORModel; score: number }
  const scored: Scored[] = []

  for (const m of models) {
    const [orgSlug, modelSlug] = m.id.split('/')
    const mTokens = normTokens(modelSlug ?? m.id)

    // Company prefix bonus
    const prefixMatch = orgPrefixes.length === 0 ||
      orgPrefixes.some(p => orgSlug?.toLowerCase().includes(p))

    const overlap = tokenOverlap(qTokens, mTokens)
    // Allow slug-similar models even if token overlap is 0 (e.g. "GPT-5.5 Pro" → "gpt-5.5-pro")
    const mSlug   = slugify(modelSlug ?? m.id)
    const slugSim = slugSimilarity(qSlug, mSlug)
    if (overlap === 0 && slugSim < 0.5) continue

    // Score = overlap ratio + slug similarity bonus, boosted if company matches
    const baseScore = overlap > 0
      ? overlap / Math.max(qTokens.length, mTokens.length)
      : 0
    const score = (baseScore + slugSim * 0.5) * (prefixMatch ? 1.5 : 1.0)

    scored.push({ model: m, score })
  }

  if (scored.length === 0) return null
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  // Require either: score ≥ 0.6, OR score ≥ 0.4 with company prefix match
  // This prevents short model names (RT-2, pi0) from matching unrelated models
  const minScore = orgPrefixes.length > 0 ? 0.4 : 0.6
  if (best.score < minScore) return null

  // Extra guard: at least one alphabetic token must match (not just numbers)
  const [orgSlug2, modelSlug2] = best.model.id.split('/')
  const mToks = normTokens(modelSlug2 ?? best.model.id)
  const hasAlphaMatch = qTokens.some(t => /[a-z]/.test(t) && mToks.includes(t))
  if (!hasAlphaMatch) return null

  const m = best.model
  const inputPrice  = parseFloat(m.pricing.prompt)     * 1_000_000
  const outputPrice = parseFloat(m.pricing.completion) * 1_000_000

  return {
    context_length:           m.context_length,
    context_window:           fmtContextLen(m.context_length),
    input_price_per_million:  Math.round(inputPrice  * 1000) / 1000,
    output_price_per_million: Math.round(outputPrice * 1000) / 1000,
    or_model_id:              m.id,
  }
}
