/**
 * Official benchmark scrapers — SWE-bench, LMSYS Chatbot Arena, Artificial Analysis,
 * Epoch AI Notable Models Database
 *
 * Fetches ground-truth data directly from authoritative sources so benchmark
 * scores are never guessed by the LLM.  Results are cached in-memory (1 h TTL)
 * to avoid hammering external services on every scrape request.
 *
 * Failure modes are all *soft*: if a scraper fails we return an empty map /
 * null and the LLM-extracted value is used as-is.
 *
 * Sources:
 *   SWE-bench Verified   https://www.swebench.com/
 *   LMSYS Chatbot Arena  https://lmarena.ai/  (JSON API → GitHub fallback → HTML)
 *   Artificial Analysis  https://artificialanalysis.ai/models/{slug}
 *   Epoch AI             https://epoch.ai/data/epochdb/notable_ai_models.csv
 */

const CACHE_TTL_MS = 60 * 60 * 1000   // 1 hour

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BenchmarkEntry {
  /** Canonical model name from the leaderboard */
  modelName: string
  /** Score (% for SWE-bench, ELO for Arena) */
  score: number
  /** Source URL */
  sourceUrl: string
}

export interface BenchmarkMap {
  /** key = normalised model name (lower-case, spaces collapsed) */
  [normKey: string]: BenchmarkEntry
}

export interface AAModelData {
  /** Artificial Analysis Quality Index (0–100) */
  qualityIndex: number | null
  sourceUrl: string
}

// ─── In-memory caches ─────────────────────────────────────────────────────────

let sweCache:   { data: BenchmarkMap; ts: number } | null = null
let arenaCache: { data: BenchmarkMap; ts: number } | null = null
const aaCache   = new Map<string, { data: AAModelData; ts: number }>()

// ─── Benchmark name normalisation ─────────────────────────────────────────────

/**
 * Reduce "Claude 3.7 Sonnet (20250219)" → "claude 3.7 sonnet" for matching.
 */
export function normModelName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([\w.\-]+\)/g, '')          // strip parenthetical version tags
    .replace(/\b(preview|beta|latest|api|claude\.ai|chat)\b/g, '')
    .replace(/[\s\-_/]+/g, ' ')            // separators → space
    .replace(/\.(?!\d)/g, ' ')             // dot not before digit → space
    .trim()
}

/**
 * Canonicalize benchmark names to avoid storing the same metric twice.
 *
 * Examples:
 *   "SWE-bench Verified" / "SWE Bench" → "SWE-bench"
 *   "MMLU Pro" / "MMLU-Pro"            → "MMLU"
 *   "Arena ELO" / "Chatbot Arena Elo"  → "Arena ELO"
 *   "MATH-500" / "MATH 500"            → "MATH"
 *   "Quality Index" / "AA Quality"     → "AA Quality"
 *   "LiveBench Score"                  → "LiveBench"
 */
export function normBenchmarkName(raw: string): string {
  const s = raw.toLowerCase().replace(/[-_\s]+/g, ' ').trim()

  if (s.startsWith('swe'))                           return 'SWE-bench'
  if (s.startsWith('mmlu') || s.includes('massive multitask'))
                                                     return 'MMLU'
  if (s.includes('arena') || s.includes('chatbot arena') ||
      s === 'elo' || s.startsWith('elo '))           return 'Arena ELO'
  if (s.startsWith('math'))                          return 'MATH'
  if (s.startsWith('humaneval'))                     return 'HumanEval'
  if (s.startsWith('gpqa'))                          return 'GPQA'
  if (s.includes('aime'))                            return 'AIME'
  if (s.startsWith('livebench'))                     return 'LiveBench'
  if (s.includes('quality index') || s === 'aa quality' ||
      s.startsWith('artificial analysis quality') ||
      s.includes('intelligence index'))              return 'AA Quality'
  if (s.startsWith('hellaswag'))                     return 'HellaSwag'
  if (s.startsWith('arc'))                           return 'ARC'
  if (s.startsWith('truthfulqa') || s.startsWith('truthful qa'))
                                                     return 'TruthfulQA'
  if (s.startsWith('gsm8k') || s === 'gsm 8k')      return 'GSM8K'
  if (s.startsWith('bbh') || s.startsWith('big bench hard'))
                                                     return 'BBH'

  // Capitalise first letter of raw name as canonical form
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * Try to match `query` against the keys of `map`.
 * Returns the BenchmarkEntry or null.
 */
export function lookupBenchmark(query: string, map: BenchmarkMap): BenchmarkEntry | null {
  const t = normModelName(query)
  if (!t) return null

  // 1. Exact match
  if (map[t]) return map[t]

  // 2. Prefix match (query starts with a key, e.g. "claude 3.7 sonnet 20250219" → "claude 3.7 sonnet")
  const keys = Object.keys(map)
  const prefix = keys.find(k => t.startsWith(k) || k.startsWith(t))
  if (prefix) return map[prefix]

  // 3. Substring match — longest key wins to avoid "gpt-4" matching "gpt-4o"
  const subMatches = keys.filter(k => k.includes(t) || t.includes(k))
  if (subMatches.length) {
    const best = subMatches.sort((a, b) => b.length - a.length)[0]
    return map[best]
  }

  return null
}

// ─── SWE-bench Verified leaderboard ──────────────────────────────────────────

const SWE_URL = 'https://www.swebench.com/'

function parsePct(s: string): number | null {
  const m = s.match(/([\d]+\.?[\d]*)/)
  if (!m) return null
  const v = parseFloat(m[1])
  return isNaN(v) ? null : v
}

function parseSWEBenchHTML(html: string): BenchmarkMap {
  const result: BenchmarkMap = {}
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1]
    const cells: string[] = []
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(row)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      cells.push(text)
    }

    if (cells.length < 2) continue
    const name = cells[0]
    if (!name || name.length > 80 || /^\d+$/.test(name)) continue

    for (let i = 1; i < cells.length; i++) {
      if (cells[i].includes('%') || /^\d{1,2}(\.\d+)?$/.test(cells[i].trim())) {
        const score = parsePct(cells[i])
        if (score !== null && score > 0 && score <= 100) {
          const key = normModelName(name)
          if (key) result[key] = { modelName: name, score, sourceUrl: SWE_URL }
          break
        }
      }
    }
  }

  return result
}

export async function fetchSWEBenchLeaderboard(): Promise<BenchmarkMap> {
  if (sweCache && Date.now() - sweCache.ts < CACHE_TTL_MS) return sweCache.data

  try {
    const res = await fetch(SWE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ModelTrack-BenchScraper/1.0)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`SWE-bench HTTP ${res.status}`)
    const html = await res.text()
    const data = parseSWEBenchHTML(html)
    sweCache = { data, ts: Date.now() }
    console.log(`[BenchScrapers] SWE-bench: loaded ${Object.keys(data).length} entries`)
    return data
  } catch (err) {
    console.warn('[BenchScrapers] SWE-bench fetch failed:', err)
    return sweCache?.data ?? {}
  }
}

// ─── LMSYS Chatbot Arena ELO ──────────────────────────────────────────────────
//
// lmarena.ai is a Next.js SPA — the rendered page has no static <tr> table.
// Strategy (tried in order):
//   1. lmarena.ai JSON API endpoint (public, returns leaderboard JSON)
//   2. GitHub raw data file (FastChat repo, updated regularly)
//   3. HuggingFace dataset snapshot
//   4. Static blog post HTML (lmsys.org/blog/) — has rendered tables

const ARENA_JSON_SOURCES = [
  // Official API — may not always exist, but try first
  { url: 'https://lmarena.ai/api/leaderboard', type: 'api' as const },
  // GitHub raw — FastChat leaderboard data updated by LMSYS team
  { url: 'https://raw.githubusercontent.com/lm-sys/FastChat/main/leaderboard_data/arena_results.json', type: 'github' as const },
]

const ARENA_HTML_SOURCES = [
  // Static blog articles with rendered ELO tables
  'https://lmsys.org/blog/2025-04-04-arena-v3/',
  'https://lmsys.org/blog/2025-01-24-clementine/',
]

/**
 * Parse lmarena.ai JSON API response.
 * Expected shape: Array<{ model_name: string; elo_rating: number; ... }>
 * or { leaderboard: Array<{ model: string; elo: number }> }
 */
function parseArenaJSON(json: unknown, sourceUrl: string): BenchmarkMap {
  const result: BenchmarkMap = {}

  const rows: any[] = Array.isArray(json)
    ? json
    : (json as any)?.leaderboard ?? (json as any)?.data ?? (json as any)?.models ?? []

  if (!Array.isArray(rows)) return result

  for (const row of rows) {
    // Try common field name patterns
    const name: string =
      row.model_name ?? row.model ?? row.name ?? row.Model ?? ''
    const elo: number =
      row.elo_rating ?? row.elo ?? row.arena_score ?? row.rating ?? row.Elo ?? 0

    if (!name || typeof elo !== 'number') continue
    if (elo < 800 || elo > 2500) continue

    const key = normModelName(name)
    if (key) result[key] = { modelName: name, score: Math.round(elo), sourceUrl }
  }

  return result
}

/**
 * Parse HTML pages that contain a rendered ELO table (static blog posts).
 */
function parseArenaHTML(html: string, sourceUrl: string): BenchmarkMap {
  const result: BenchmarkMap = {}
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1]
    const cells: string[] = []
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(row)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      cells.push(text)
    }

    if (cells.length < 2) continue
    const name = cells[0]
    if (!name || name.length > 80) continue

    for (let i = 1; i < cells.length; i++) {
      const m = cells[i].match(/^(\d{3,4})(\s|$)/)
      if (m) {
        const elo = parseInt(m[1], 10)
        if (elo >= 800 && elo <= 2500) {
          const key = normModelName(name)
          if (key) result[key] = { modelName: name, score: elo, sourceUrl }
          break
        }
      }
    }
  }

  return result
}

export async function fetchArenaLeaderboard(): Promise<BenchmarkMap> {
  if (arenaCache && Date.now() - arenaCache.ts < CACHE_TTL_MS) return arenaCache.data

  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; ModelTrack-BenchScraper/1.0)' }

  // ── Strategy 1 & 2: JSON sources ─────────────────────────────────────────
  for (const source of ARENA_JSON_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { ...headers, Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') ?? ''
      // Only parse if the response looks like JSON
      if (!ct.includes('json') && source.type === 'api') continue
      const json = await res.json()
      const data = parseArenaJSON(json, source.url)
      if (Object.keys(data).length >= 5) {
        arenaCache = { data, ts: Date.now() }
        console.log(`[BenchScrapers] Arena (JSON): loaded ${Object.keys(data).length} entries from ${source.url}`)
        return data
      }
    } catch (err) {
      console.warn(`[BenchScrapers] Arena JSON source failed (${source.url}):`, err)
    }
  }

  // ── Strategy 3: HTML static blog pages ───────────────────────────────────
  for (const url of ARENA_HTML_SOURCES) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) continue
      const html = await res.text()
      const data = parseArenaHTML(html, url)
      if (Object.keys(data).length >= 5) {
        arenaCache = { data, ts: Date.now() }
        console.log(`[BenchScrapers] Arena (HTML): loaded ${Object.keys(data).length} entries from ${url}`)
        return data
      }
    } catch (err) {
      console.warn(`[BenchScrapers] Arena HTML fallback failed (${url}):`, err)
    }
  }

  console.warn('[BenchScrapers] Arena: all sources failed, using stale cache or empty')
  return arenaCache?.data ?? {}
}

// ─── Artificial Analysis ─────────────────────────────────────────────────────
//
// AA model pages are Next.js apps. We try two extraction approaches:
//   1. Parse __NEXT_DATA__ JSON embedded in the page (most reliable)
//   2. Regex scan for "Quality Index" numeric value in stripped text

const AA_BASE = 'https://artificialanalysis.ai/models/'

/**
 * Attempt to extract Quality Index from AA's __NEXT_DATA__ JSON blob.
 * The JSON structure varies but commonly has:
 *   pageProps.model.quality_index  OR
 *   pageProps.modelData.quality    OR
 *   a "quality_index" key anywhere in the top-level props
 */
function parseAANextData(json: any): number | null {
  if (!json || typeof json !== 'object') return null

  // Recursive depth-limited search for "quality_index" key
  function search(obj: any, depth: number): number | null {
    if (depth > 6 || !obj || typeof obj !== 'object') return null

    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase()
      if ((key === 'quality_index' || key === 'quality' || key === 'qualityindex') &&
          typeof v === 'number' && v > 0 && v <= 100) {
        return v
      }
      // Recurse into nested objects/arrays (but not into huge arrays)
      if (typeof v === 'object' && v !== null) {
        if (Array.isArray(v) && v.length > 20) continue
        const found = search(v, depth + 1)
        if (found !== null) return found
      }
    }
    return null
  }

  return search(json?.props ?? json, 0)
}

/**
 * Fallback: scan stripped text for patterns like:
 *   "Quality Index 78.3" / "Quality Index: 78" / "78.3 Quality"
 */
function parseAAQualityFromText(text: string): number | null {
  // Pattern 1: "Quality Index" followed by a number
  const m1 = text.match(/quality\s+index[\s:]+(\d{1,3}(?:\.\d+)?)/i)
  if (m1) {
    const v = parseFloat(m1[1])
    if (v > 0 && v <= 100) return v
  }
  // Pattern 2: number followed by "Quality Index"
  const m2 = text.match(/(\d{1,3}(?:\.\d+)?)\s+quality\s+index/i)
  if (m2) {
    const v = parseFloat(m2[1])
    if (v > 0 && v <= 100) return v
  }
  return null
}

/**
 * Fetch Artificial Analysis quality data for a model.
 * @param slug  AA URL slug, e.g. "claude-3-7-sonnet" (from source_registry evals[0])
 */
export async function fetchArtificialAnalysis(slug: string): Promise<AAModelData> {
  const cached = aaCache.get(slug)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

  const sourceUrl = `${AA_BASE}${slug}`

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ModelTrack-BenchScraper/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(14_000),
    })
    if (!res.ok) throw new Error(`AA fetch HTTP ${res.status}`)

    const html = await res.text()

    // ── Attempt 1: __NEXT_DATA__ JSON ──────────────────────────────────────
    const nextDataMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextDataMatch) {
      try {
        const json = JSON.parse(nextDataMatch[1])
        const qi = parseAANextData(json)
        if (qi !== null) {
          const result: AAModelData = { qualityIndex: qi, sourceUrl }
          aaCache.set(slug, { data: result, ts: Date.now() })
          console.log(`[BenchScrapers] AA (JSON): ${slug} quality=${qi}`)
          return result
        }
      } catch {
        // JSON parse failed, fall through
      }
    }

    // ── Attempt 2: regex on stripped text ──────────────────────────────────
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{3,}/g, '\n')
      .slice(0, 20_000)   // wider window than multi_source_fetcher since we own this parse

    const qi = parseAAQualityFromText(text)
    const result: AAModelData = { qualityIndex: qi, sourceUrl }
    aaCache.set(slug, { data: result, ts: Date.now() })
    if (qi !== null) {
      console.log(`[BenchScrapers] AA (regex): ${slug} quality=${qi}`)
    } else {
      console.warn(`[BenchScrapers] AA: could not extract quality for ${slug}`)
    }
    return result
  } catch (err) {
    console.warn(`[BenchScrapers] AA fetch failed (${slug}):`, err)
    return { qualityIndex: null, sourceUrl }
  }
}

// ─── Public composite helper ──────────────────────────────────────────────────

export interface OfficialBenchmarks {
  swe:       { score: number; sourceUrl: string } | null
  arena:     { score: number; sourceUrl: string } | null
  /** Artificial Analysis Quality Index (0–100) */
  aaQuality: { score: number; sourceUrl: string } | null
  /** Epoch AI model entry — release date, params, modalities, source URL */
  epoch:     EpochModelEntry | null
}

/**
 * Looks up SWE-bench Verified, Arena ELO, AA Quality, and Epoch AI metadata
 * for a given model. Parallel fetch — any individual failure returns null.
 */
export async function getOfficialBenchmarks(
  modelName: string,
  aaSlug?: string,
  company?: string,
): Promise<OfficialBenchmarks> {
  const [sweRes, arenaRes, aaRes, epochRes] = await Promise.allSettled([
    fetchSWEBenchLeaderboard(),
    fetchArenaLeaderboard(),
    aaSlug ? fetchArtificialAnalysis(aaSlug) : Promise.resolve(null),
    lookupEpochModel(modelName, company),
  ])

  const sweData   = sweRes.status   === 'fulfilled' ? sweRes.value   : {}
  const arenaData = arenaRes.status === 'fulfilled' ? arenaRes.value : {}
  const aaData    = aaRes.status    === 'fulfilled' ? aaRes.value    : null
  const epochData = epochRes.status === 'fulfilled' ? epochRes.value : null

  const sweEntry   = lookupBenchmark(modelName, sweData as BenchmarkMap)
  const arenaEntry = lookupBenchmark(modelName, arenaData as BenchmarkMap)

  return {
    swe:       sweEntry   ? { score: sweEntry.score,   sourceUrl: sweEntry.sourceUrl }   : null,
    arena:     arenaEntry ? { score: arenaEntry.score, sourceUrl: arenaEntry.sourceUrl } : null,
    aaQuality: (aaData && aaData.qualityIndex !== null)
      ? { score: aaData.qualityIndex, sourceUrl: aaData.sourceUrl }
      : null,
    epoch: epochData,
  }
}

// ─── Cache invalidation ───────────────────────────────────────────────────────

export function clearBenchmarkCaches() {
  sweCache  = null
  arenaCache = null
  aaCache.clear()
  epochCache = null
}

// ─── Epoch AI Notable Models ──────────────────────────────────────────────────
//
// Epoch AI maintains a public CSV database of notable AI models:
//   https://epoch.ai/data/epochdb/notable_ai_models.csv
//
// Columns used:
//   Model            — display name (e.g. "GPT-4o")
//   Organization     — company (e.g. "OpenAI")
//   Publication date — ISO YYYY-MM-DD
//   Parameters       — raw parameter count (float); divide by 1e9 for billions
//   Domain           — "Language", "Multimodal", "Code", "Vision", …
//   Link             — official source URL (e.g. https://openai.com/index/gpt-5-1/)
//   Open model weights? — "Yes"/"No"/"Partially"
//
// Cache TTL: 2 hours (data updates less frequently than benchmarks)

export interface EpochModelEntry {
  name:            string
  organization:    string
  publicationDate: string | null   // "YYYY-MM-DD"
  params:          string | null   // "70B", "405B", "1.6T", etc. — null for closed models
  modalities:      string[] | null // derived from Domain column
  openWeights:     boolean | null
  sourceUrl:       string | null   // official announcement URL from Epoch Link column
}

type EpochModelMap = Map<string, EpochModelEntry>  // key = normModelName(name)

let epochCache: { data: EpochModelMap; ts: number } | null = null
const EPOCH_CACHE_TTL_MS = 2 * 60 * 60 * 1000   // 2 hours

const EPOCH_CSV_URL = 'https://epoch.ai/data/epochdb/notable_ai_models.csv'

/** Minimal RFC-4180 CSV row parser (handles quoted fields with commas). */
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) {
      result.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  result.push(cur)
  return result
}

/** Convert domain string → modalities array. */
function domainToModalities(domain: string): string[] {
  const d = domain.toLowerCase()
  if (!d || d === 'language' || d === 'text') return ['text']
  if (d.includes('multimodal') || d.includes('vision')) return ['text', 'vision']
  if (d.includes('audio') || d.includes('speech'))       return ['text', 'audio']
  if (d.includes('code'))                                 return ['text', 'code']
  if (d.includes('image'))                                return ['vision']
  return ['text']
}

/** Convert raw parameter count to display string ("70B", "1.6T"). */
function formatParams(raw: string): string | null {
  if (!raw || raw.trim() === '') return null
  const num = parseFloat(raw)
  if (isNaN(num) || num <= 0) return null
  const billions = num / 1e9
  if (billions >= 1000) return `${(billions / 1000).toFixed(1)}T`
  if (billions >= 1)    return `${parseFloat(billions.toFixed(1))}B`
  const millions = num / 1e6
  if (millions >= 1)    return `${parseFloat(millions.toFixed(0))}M`
  return null
}

function parseEpochCSV(csv: string): EpochModelMap {
  const map: EpochModelMap = new Map()
  const lines = csv.split('\n')
  if (lines.length < 2) return map

  const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase().trim())
  const col = (names: string[]) => names.map(n => headers.findIndex(h => h.includes(n))).find(i => i >= 0) ?? -1

  const iModel  = col(['model'])
  const iOrg    = col(['organization', 'company', 'developer'])
  const iDate   = col(['publication date', 'release date', 'date'])
  const iParams = col(['parameters'])
  const iDomain = col(['domain', 'modality'])
  const iLink   = col(['link', 'url'])
  const iOpen   = col(['open model weights', 'open weights'])

  if (iModel < 0) return map

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCSVRow(line)

    const name = cols[iModel]?.trim()
    if (!name) continue

    const entry: EpochModelEntry = {
      name,
      organization:    iOrg >= 0  ? (cols[iOrg]?.trim()  ?? '')    : '',
      publicationDate: iDate >= 0 ? (cols[iDate]?.trim()?.slice(0, 10) || null) : null,
      params:          iParams >= 0 ? formatParams(cols[iParams] ?? '') : null,
      modalities:      iDomain >= 0 ? domainToModalities(cols[iDomain] ?? '') : null,
      openWeights:     iOpen >= 0
        ? (cols[iOpen]?.toLowerCase().trim().startsWith('yes') || null)
        : null,
      sourceUrl:       iLink >= 0 ? (cols[iLink]?.trim() || null) : null,
    }
    map.set(normModelName(name), entry)
  }

  return map
}

async function fetchEpochDatabase(): Promise<EpochModelMap> {
  if (epochCache && Date.now() - epochCache.ts < EPOCH_CACHE_TTL_MS) return epochCache.data

  try {
    const res = await fetch(EPOCH_CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ModelTrack-BenchScraper/1.0)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Epoch HTTP ${res.status}`)
    const text = await res.text()
    const data = parseEpochCSV(text)
    if (data.size < 10) throw new Error('Epoch CSV too small — parse failed')
    epochCache = { data, ts: Date.now() }
    console.log(`[BenchScrapers] Epoch: loaded ${data.size} models`)
    return data
  } catch (err) {
    console.warn('[BenchScrapers] Epoch fetch failed:', err)
    return epochCache?.data ?? new Map()
  }
}

/**
 * Look up a model in the Epoch AI database.
 * Returns release date, params, modalities, and official source URL.
 * Soft-fails (returns null) on any error.
 */
export async function lookupEpochModel(
  modelName: string,
  company?: string,
): Promise<EpochModelEntry | null> {
  try {
    const db = await fetchEpochDatabase()
    const key = normModelName(modelName)

    // 1. Exact normalised match
    const exact = db.get(key)
    if (exact && matchesCompany(exact, company)) return exact

    // 2. Prefix / suffix match (handles versioned variants like "GPT-4o (Mar 2025)")
    for (const [k, entry] of db) {
      if ((k.startsWith(key) || key.startsWith(k)) && matchesCompany(entry, company)) {
        return entry
      }
    }

    // 3. Substring match — prefer longer key (more specific)
    const subMatches: [string, EpochModelEntry][] = []
    for (const [k, entry] of db) {
      if ((k.includes(key) || key.includes(k)) && matchesCompany(entry, company)) {
        subMatches.push([k, entry])
      }
    }
    if (subMatches.length) {
      subMatches.sort((a, b) => b[0].length - a[0].length)
      return subMatches[0][1]
    }

    return null
  } catch {
    return null
  }
}

function matchesCompany(entry: EpochModelEntry, company?: string): boolean {
  if (!company) return true
  const a = entry.organization.toLowerCase()
  const b = company.toLowerCase()
  return a.includes(b) || b.includes(a)
}

/**
 * List all Epoch AI models released within a date range, optionally filtered
 * by company names. Used by the discover-new-models admin endpoint.
 */
export async function listEpochModelsByDateRange(
  since: string,            // "YYYY-MM-DD" inclusive
  until: string,            // "YYYY-MM-DD" inclusive
  companies?: string[],     // if provided, filter to these company names
): Promise<EpochModelEntry[]> {
  const data = await fetchEpochDatabase()
  const results: EpochModelEntry[] = []

  for (const entry of data.values()) {
    const d = entry.publicationDate
    if (!d || d < since || d > until) continue
    if (companies && companies.length > 0) {
      const match = companies.some(c => matchesCompany(entry, c))
      if (!match) continue
    }
    results.push(entry)
  }

  return results.sort((a, b) =>
    (a.publicationDate ?? '').localeCompare(b.publicationDate ?? ''),
  )
}
