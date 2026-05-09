import OpenAI from 'openai'

export interface ExtractedModel {
  name: string | null
  company: string | null
  release_date: string | null       // YYYY-MM-DD
  params: string | null             // dense: "70B"; MoE: "671B-A37B" (hyphen-A format)
  context_window: string | null     // "128K", "1M"
  license: 'open' | 'closed' | 'partial' | null
  modalities: string[]
  architecture: string | null
  innovation: string | null
  benchmarks: { name: string; score: number }[]
  input_price: number | null        // USD per 1M tokens
  output_price: number | null
  source_url: string | null
  confidence: Record<string, 'high' | 'medium' | 'low'>
}

// ─── LLM provider chain ───────────────────────────────────────────────────────
// Priority: enterprise OpenClaw → personal Kimi API
// A provider is skipped if its base URL is a loopback address (not reachable from cloud).

interface LLMProvider {
  name: string
  client: OpenAI
  model: string
}

function isLoopback(url: string) {
  return url.includes('127.0.0.1') || url.includes('localhost')
}

function buildProviders(): LLMProvider[] {
  const providers: LLMProvider[] = []

  const openclawUrl = process.env.OPENCLAW_BASE_URL ?? 'http://127.0.0.1:8765/v1'
  if (!isLoopback(openclawUrl)) {
    providers.push({
      name: 'OpenClaw',
      client: new OpenAI({
        apiKey: process.env.OPENCLAW_API_KEY ?? 'dummy',
        baseURL: openclawUrl,
      }),
      model: process.env.OPENCLAW_MODEL ?? 'chj-private-claude-opus-4.6',
    })
  }

  const kimiKey = process.env.LLM_API_KEY
  if (kimiKey && kimiKey !== 'dummy') {
    providers.push({
      name: 'Kimi',
      client: new OpenAI({
        apiKey: kimiKey,
        baseURL: process.env.LLM_BASE_URL ?? 'https://api.moonshot.cn/v1',
      }),
      model: process.env.LLM_MODEL ?? 'moonshot-v1-128k',
    })
  }

  return providers
}

const PROVIDERS = buildProviders()

const SYSTEM = `You are a precise data extraction agent for an AI model intelligence database.
Extract structured information about an AI model from the provided text.
Return ONLY valid JSON matching the schema. Use null for unknown fields — never guess.

Confidence rules:
- "high"   = explicitly stated with a number or clear label in the text
- "medium" = mentioned but ambiguous, or inferred from context
- "low"    = referenced indirectly or from a different model version

Benchmark name normalization (apply BEFORE returning):
- "SWE-bench Verified" / "SWE Bench" / "swe-bench*" → "SWE-bench"
- "MMLU" / "MMLU Pro" / "MMLU-Pro" / "Massive Multitask*" → "MMLU"
- "MATH" / "MATH-500" / "MATH 500" → "MATH"
- "Arena ELO" / "Chatbot Arena" / "ELO score" / "Arena Score" → "Arena ELO"
- "HumanEval" → "HumanEval"
- "GPQA" / "GPQA Diamond" → "GPQA"
- "AIME" / "AIME 2024" → "AIME"
- "LiveBench*" → "LiveBench"
- "Quality Index" / "AA Quality" / "Artificial Analysis Quality" → "AA Quality"
- "HellaSwag" / "Hellaswag" → "HellaSwag"
- "BBH" / "Big Bench Hard" → "BBH"
- "GSM8K" / "GSM 8K" → "GSM8K"
- Keep all others as-is (capitalise first letter)

IMPORTANT — do NOT treat the following as benchmarks (they are Artificial Analysis site metrics, not AI capability benchmarks):
- "Artificial analysis intelligence index" / "Intelligence index" / "Quality index score"
- "Speed" / "Tokens per second" / "TPS"
- "Input price" / "Output price" (as a benchmark name)
- "Verbosity" / "Context window size" (as a benchmark name)
- Any entry where the "score" is a price or index value from a comparison site`

const SCHEMA = `{
  "name": string,
  "company": string,
  "release_date": "YYYY-MM-DD" | null,
  "params": "FORMAT RULES — dense model: '70B' / '405B'; MoE model: 'totalB-AtotalActiveB' e.g. '671B-A37B' or '235B-A22B' (hyphen-A is REQUIRED to separate total from active); if params not disclosed: 'Undisclosed'; never use parentheses or spaces as separator" | null,
  "context_window": "numeric + unit only, e.g. '128K', '200K', '1M', '10M'; no extra words" | null,
  "license": "open" | "closed" | "partial" | null,
  "modalities": ["text","vision","audio","code","image-gen"],
  "architecture": string | null,
  "innovation": "1-2 sentence summary of key novelty" | null,
  "benchmarks": [{"name": string, "score": number}],
  "input_price": number | null,
  "output_price": number | null,
  "source_url": string | null,
  "confidence": {
    "name": "high"|"medium"|"low",
    "company": "high"|"medium"|"low",
    "release_date": "high"|"medium"|"low",
    "params": "high"|"medium"|"low",
    "context_window": "high"|"medium"|"low",
    "license": "high"|"medium"|"low",
    "modalities": "high"|"medium"|"low",
    "architecture": "high"|"medium"|"low",
    "innovation": "high"|"medium"|"low",
    "benchmarks": "high"|"medium"|"low",
    "input_price": "high"|"medium"|"low",
    "output_price": "high"|"medium"|"low"
  }
}`

// ─── Content preparation ──────────────────────────────────────────────────────

const CONTENT_MAX = 12_000
const HEAD_CHARS  =  6_000   // always keep leading section (intro / release notes)
const ANCHOR_HALF =  3_000   // chars either side of model-name anchor

/**
 * Smart content window:
 *   1. Always keep the first HEAD_CHARS characters (general intro, release date).
 *   2. If hint.name is provided, find its first occurrence in the text and
 *      add ±ANCHOR_HALF chars around it to capture adjacent benchmark tables.
 *   3. Deduplicate overlapping sections, cap total at CONTENT_MAX.
 *
 * This prevents multi-model eval pages from diluting the target model's data.
 */
export function prepareContent(content: string, hint?: { name?: string; company?: string }): string {
  if (content.length <= CONTENT_MAX) return content

  const head = content.slice(0, HEAD_CHARS)

  if (!hint?.name) return head + content.slice(HEAD_CHARS, CONTENT_MAX)

  // Locate the target model name (case-insensitive)
  const needle = hint.name.toLowerCase()
  const idx = content.toLowerCase().indexOf(needle)
  if (idx === -1) return head + content.slice(HEAD_CHARS, CONTENT_MAX)

  const anchorStart = Math.max(HEAD_CHARS, idx - ANCHOR_HALF)
  const anchorEnd   = Math.min(content.length, idx + ANCHOR_HALF)
  const anchor = content.slice(anchorStart, anchorEnd)

  const combined = head + '\n…\n' + anchor
  return combined.slice(0, CONTENT_MAX)
}

export async function extractModelData(
  content: string,
  hint?: { name?: string; company?: string }
): Promise<ExtractedModel> {
  const hintText = hint ? `\nHint — model name: "${hint.name ?? ''}", company: "${hint.company ?? ''}"` : ''

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Extract model data from this content.${hintText}

Return ONLY JSON matching this schema:
${SCHEMA}

--- CONTENT ---
${prepareContent(content, hint)}`,
    },
  ]

  let lastError: Error = new Error('No LLM providers configured')

  for (const provider of PROVIDERS) {
    try {
      const res = await provider.client.chat.completions.create({
        model: provider.model,
        max_tokens: 2048,
        messages,
      })
      const text = res.choices[0]?.message?.content ?? ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error(`${provider.name} did not return JSON. Response: ${text.slice(0, 200)}`)
      console.log(`[extractor] used provider: ${provider.name}`)
      return JSON.parse(jsonMatch[0]) as ExtractedModel
    } catch (err: any) {
      console.warn(`[extractor] provider ${provider.name} failed:`, err?.message ?? err)
      lastError = err
    }
  }

  throw lastError
}
