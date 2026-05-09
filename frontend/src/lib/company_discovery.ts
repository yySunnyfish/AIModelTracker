/**
 * Company Discovery — multi-source detection of newly released AI models.
 *
 * Sources (in priority order):
 *  1. Epoch AI CSV     — notable_ai_models.csv, ~1 000 models, updated weekly
 *  2. HuggingFace API  — /api/models?author={org}&sort=lastModified
 *
 * Categories:
 *  - 'llm'      — language / multimodal frontier models
 *  - 'embodied' — robotics, world models, video generation, physics sims
 *
 * Output: CandidateModel[] — deduplicated, sorted by release date desc.
 */

import { listEpochModelsByDateRange, EpochModelEntry } from './benchmark_scrapers'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ModelCategory = 'llm' | 'embodied'

export interface CandidateModel {
  name:        string
  company:     string           // canonical company name (matches DB)
  releaseDate: string | null    // "YYYY-MM-DD" from Epoch / HF lastModified
  params:      string | null    // "70B", "405B", "1.6T" — null for closed models
  modalities:  string[] | null
  openWeights: boolean | null
  sourceUrl:   string | null    // official announcement URL
  source:      'epoch' | 'huggingface' | 'blog'
  category:    ModelCategory
}

// ─── LLM: Company ↔ HuggingFace org mapping ───────────────────────────────────

/** Maps canonical DB company name → HuggingFace org slug(s) */
const LLM_COMPANY_TO_HF_ORGS: Record<string, string[]> = {
  'OpenAI':           ['openai'],
  'Anthropic':        ['anthropic'],
  'Google DeepMind':  ['google', 'google-deepmind'],
  'Meta':             ['meta-llama', 'facebook'],
  'DeepSeek':         ['deepseek-ai'],
  'Alibaba':          ['Qwen', 'alibaba-pai'],
  'Alibaba / Qwen':   ['Qwen', 'alibaba-pai'],
  'MiniMax':          ['MiniMaxAI'],
  'Moonshot AI':      ['moonshotai'],
  'Zhipu AI':         ['THUDM'],
  'xAI':              ['xai-org'],
  'Mistral AI':       ['mistralai'],
  'Xiaomi':           ['XiaomiMiMo'],
  'Amazon':           ['amazon'],
  'NVIDIA':           ['nvidia'],
}

/** Maps canonical DB company name → Epoch organization spelling(s) */
const LLM_COMPANY_TO_EPOCH_ORGS: Record<string, string[]> = {
  'Google DeepMind':  ['Google DeepMind', 'Google'],
  'Alibaba':          ['Alibaba', 'Alibaba Cloud', 'Qwen'],
  'Alibaba / Qwen':   ['Alibaba', 'Alibaba Cloud', 'Qwen'],
  'xAI':              ['xAI'],
  'Mistral AI':       ['Mistral AI', 'Mistral'],
}

// ─── Embodied AI / World Model: Company ↔ HuggingFace org mapping ─────────────

/**
 * Embodied AI companies + their HF orgs.
 * Covers: robotics foundations, world models, video generation, physics simulators.
 */
const EMBODIED_COMPANY_TO_HF_ORGS: Record<string, string[]> = {
  'Physical Intelligence':  ['physical-intelligence'],
  'Figure AI':              ['figure-ai'],
  '1X Technologies':        ['1x-technologies'],
  'Unitree':                ['unitreerobotics'],
  'AgiBot':                 ['agibot-world'],
  'Wayve':                  ['wayveai'],
  'Google DeepMind':        ['google-deepmind'],   // RT-2, Genie, Gemini Robotics
  'Meta':                   ['facebook', 'meta-llama'],  // Motivo, Joint Embedding
  'NVIDIA':                 ['nvidia'],             // GR00T, Isaac
  'OpenAI':                 ['openai'],             // Sora
  'Stability AI':           ['stabilityai'],        // Video/world gen
  'Runway':                 ['runwayml'],
  'Kling AI':               ['kuaishou'],
}

const EMBODIED_COMPANY_TO_EPOCH_ORGS: Record<string, string[]> = {
  'Google DeepMind': ['Google DeepMind', 'Google'],
  'Meta':            ['Meta'],
  'NVIDIA':          ['NVIDIA'],
}

// ─── HF noise filters ─────────────────────────────────────────────────────────

/**
 * LLM mode: filter out quantization variants, fine-tunes, non-LLM model types,
 * datasets, and robotics models (we only want language/multimodal frontiers).
 */
function isHFNoiseLLM(id: string): boolean {
  const lower = id.toLowerCase()
  if (/[-._](fp8|fp4|nvfp4|gguf|awq|gptq|ggml|exl2|int4|int8|4bit|8bit|bf16|w4a8|w8a8)(\b|$)/.test(lower)) return true
  if (/[-._](qad|eagle\d?|draft|speculative)(\b|$)/.test(lower)) return true
  if (/[-._](lora|adapter|merged|sft|dpo|rlhf|reward|ppo|orpo)(\b|$)/.test(lower)) return true
  if (/[-._](tts|asr|speech|embed(ding)?|clip|vit|retriev|rerank|ocr|parse|caption|vlm.*tiny)(\b|$)/.test(lower)) return true
  if (/(dataset|subset|synthetic|captions?|annotations?)/.test(lower)) return true
  if (/(arm|robot|starter|gr00t|sim\b|isaacgym)/.test(lower)) return true
  if (/^[^/]+\/sae[-_]/.test(lower)) return true
  return false
}

/**
 * Embodied mode: filter out quantized/fine-tune noise but KEEP robotics,
 * world models, video generators, physics simulators.
 */
function isHFNoiseEmbodied(id: string): boolean {
  const lower = id.toLowerCase()
  if (/[-._](fp8|fp4|nvfp4|gguf|awq|gptq|ggml|exl2|int4|int8|4bit|8bit|bf16)(\b|$)/.test(lower)) return true
  if (/[-._](lora|adapter|merged|sft|dpo|rlhf|reward|ppo|orpo)(\b|$)/.test(lower)) return true
  if (/(^|\/)checkpoints?[-_]/.test(lower)) return true
  if (/(dataset|subset|annotations?)/.test(lower)) return true
  return false
}

function isHFNoise(id: string, category: ModelCategory): boolean {
  return category === 'embodied' ? isHFNoiseEmbodied(id) : isHFNoiseLLM(id)
}

// ─── Org name helpers ─────────────────────────────────────────────────────────

function epochOrgNames(company: string, category: ModelCategory): string[] {
  const map = category === 'embodied' ? EMBODIED_COMPANY_TO_EPOCH_ORGS : LLM_COMPANY_TO_EPOCH_ORGS
  return map[company] ?? [company]
}

function hfOrgs(company: string, category: ModelCategory): string[] | undefined {
  const map = category === 'embodied' ? EMBODIED_COMPANY_TO_HF_ORGS : LLM_COMPANY_TO_HF_ORGS
  return map[company]
}

/** Parse HF model ID "org/ModelName-7B" → display name "ModelName-7B" (preserve casing) */
function hfIdToName(id: string): string {
  return id.includes('/') ? id.split('/')[1] : id
}

/** Infer params from HF model name slug (e.g. "Llama-4-Scout-17B" → "17B") */
function inferParamsFromName(name: string): string | null {
  const m = name.match(/[-_\s](\d+(?:\.\d+)?)\s*([bBmMtT])\b/)
  if (!m) return null
  const n = parseFloat(m[1])
  const u = m[2].toUpperCase()
  if (u === 'T') return `${n}T`
  if (u === 'B') return `${n}B`
  if (u === 'M') return `${n}M`
  return null
}

// ─── Source 1: Epoch AI ───────────────────────────────────────────────────────

async function discoverFromEpoch(
  since: string,
  until: string,
  companies: string[],
  category: ModelCategory,
): Promise<CandidateModel[]> {
  const epochOrgs = [...new Set(companies.flatMap(c => epochOrgNames(c, category)))]

  let entries: EpochModelEntry[]
  try {
    entries = await listEpochModelsByDateRange(since, until, epochOrgs)
  } catch {
    return []
  }

  return entries.map(e => {
    const company = companies.find(c =>
      epochOrgNames(c, category).some(org =>
        e.organization.toLowerCase().includes(org.toLowerCase()),
      ),
    ) ?? e.organization

    return {
      name:        e.name,
      company,
      releaseDate: e.publicationDate,
      params:      e.params,
      modalities:  e.modalities,
      openWeights: e.openWeights,
      sourceUrl:   e.sourceUrl,
      source:      'epoch' as const,
      category,
    }
  })
}

// ─── Source 2: HuggingFace API ────────────────────────────────────────────────

interface HFModel {
  id:           string    // "meta-llama/Llama-4-Scout-17B-16E-Instruct"
  lastModified: string    // ISO8601
  private:      boolean
  modelId:      string
}

const HF_API_TIMEOUT = 10_000

async function fetchHFModels(org: string, since: string, category: ModelCategory): Promise<HFModel[]> {
  try {
    const url = `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&sort=lastModified&limit=50`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ModelTrack/1.0' },
      signal: AbortSignal.timeout(HF_API_TIMEOUT),
    })
    if (!res.ok) return []
    const data: HFModel[] = await res.json()
    return data.filter(m =>
      !m.private &&
      m.lastModified >= since &&
      !isHFNoise(m.id, category),
    )
  } catch {
    return []
  }
}

async function discoverFromHuggingFace(
  since: string,
  until: string,
  companies: string[],
  category: ModelCategory,
): Promise<CandidateModel[]> {
  const tasks: Promise<CandidateModel[]>[] = []

  for (const company of companies) {
    const orgs = hfOrgs(company, category)
    if (!orgs) continue

    for (const org of orgs) {
      tasks.push(
        fetchHFModels(org, since, category).then(models =>
          models
            .filter(m => {
              const d = m.lastModified.slice(0, 10)
              return d >= since && d <= until
            })
            .map(m => ({
              name:        hfIdToName(m.id),
              company,
              releaseDate: m.lastModified.slice(0, 10),
              params:      inferParamsFromName(m.id),
              modalities:  null,
              openWeights: true,
              sourceUrl:   `https://huggingface.co/${m.id}`,
              source:      'huggingface' as const,
              category,
            })),
        ),
      )
    }
  }

  const batches = await Promise.allSettled(tasks)
  return batches
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<CandidateModel[]>).value)
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function normName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.]/g, '')
}

function dedup(candidates: CandidateModel[]): CandidateModel[] {
  const seen = new Map<string, CandidateModel>()
  // epoch first so it takes priority
  const sorted = [...candidates].sort((a, b) =>
    (a.source === 'epoch' ? 0 : 1) - (b.source === 'epoch' ? 0 : 1),
  )
  for (const c of sorted) {
    const key = `${normName(c.company)}::${normName(c.name)}`
    if (!seen.has(key)) seen.set(key, c)
  }
  return [...seen.values()].sort((a, b) =>
    (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
  )
}

// ─── Keyword filter ───────────────────────────────────────────────────────────

/**
 * Filter candidates by user-provided keywords.
 * A candidate passes if ANY keyword appears in its name or company (case-insensitive).
 * If keywords is empty, all candidates pass.
 */
export function applyKeywordFilter(
  candidates: CandidateModel[],
  keywords: string[],
): CandidateModel[] {
  if (keywords.length === 0) return candidates
  return candidates.filter(c => {
    const haystack = `${c.name} ${c.company}`.toLowerCase()
    return keywords.some(kw => haystack.includes(kw.toLowerCase()))
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover AI models released by the given companies between since…until.
 * Queries Epoch AI CSV + HuggingFace API in parallel.
 * Results are deduplicated and sorted by date descending.
 *
 * @param categories  which model categories to discover (default: ['llm'])
 */
export async function discoverNewModels(
  since:      string,          // "YYYY-MM-DD"
  until:      string,          // "YYYY-MM-DD"
  companies:  string[],
  categories: ModelCategory[] = ['llm'],
): Promise<CandidateModel[]> {
  const allResults: CandidateModel[] = []

  for (const category of categories) {
    const [epochResults, hfResults] = await Promise.all([
      discoverFromEpoch(since, until, companies, category),
      discoverFromHuggingFace(since, until, companies, category),
    ])
    allResults.push(...epochResults, ...hfResults)
  }

  return dedup(allResults)
}

/** Default LLM-focused company list */
export const DEFAULT_LLM_COMPANIES = [
  'OpenAI', 'Anthropic', 'Google DeepMind', 'Meta', 'xAI',
  'Mistral AI', 'DeepSeek', 'Alibaba', 'MiniMax', 'Moonshot AI',
  'Zhipu AI', 'StepFun', 'Xiaomi', 'Amazon', 'NVIDIA',
]

/** Embodied AI / World Model focused company list */
export const DEFAULT_EMBODIED_COMPANIES = [
  'Physical Intelligence', 'Figure AI', '1X Technologies', 'Unitree', 'AgiBot',
  'Wayve', 'Google DeepMind', 'Meta', 'NVIDIA', 'OpenAI', 'Stability AI', 'Runway', 'Kling AI',
]
