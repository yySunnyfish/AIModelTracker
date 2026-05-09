/**
 * Source Registry — authoritative URL priority lists, per company and model.
 *
 * Design principles:
 *  1. Official first: company blog / docs always outrank community mirrors.
 *  2. Field-specific: some fields (pricing) live only on the pricing page;
 *     others (benchmark, architecture) are in announcement blogs.
 *  3. Three mandatory source tiers:
 *       primary     = company official website (blog / announcement / docs)
 *       huggingface = HuggingFace model card  (open-source models only)
 *       evals       = top-5 global evaluation institutions
 *  4. Fallback chain: up to 3 URLs tried in order until one yields data.
 *
 * Top-5 global evaluation institutions tracked:
 *   1. LMSYS Chatbot Arena  — lmarena.ai             (live-scraped by benchmark_scrapers.ts)
 *   2. Artificial Analysis  — artificialanalysis.ai  (per-model quality + performance)
 *   3. Open LLM Leaderboard — HuggingFace             (open-source models)
 *   4. LiveBench            — livebench.ai            (contamination-free multi-domain)
 *   5. SWE-bench            — swebench.com            (live-scraped by benchmark_scrapers.ts)
 *
 * Usage:
 *   const sources = getModelSources('Claude 3.7 Sonnet', 'Anthropic')
 *   // → { primary, pricing, huggingface, arxiv, evals, … }
 */

export type FieldGroup = 'general' | 'pricing' | 'benchmarks' | 'architecture'

export interface ModelSourceEntry {
  /** Main announcement page — best for release_date, params, innovation */
  primary: string[]
  /** Dedicated pricing/API page — best for input_price, output_price */
  pricing: string[]
  /** HuggingFace model card — good for params, architecture, license (open models) */
  huggingface?: string[]
  /** arXiv technical report — best for architecture, benchmark details */
  arxiv?: string[]
  /** Provider API/docs page — context_window, modalities */
  docs?: string[]
  /** Top-5 global evaluation leaderboard pages for this model */
  evals?: string[]
}

// ─── Global evaluation leaderboard constants ──────────────────────────────────

const AA  = (slug: string) => `https://artificialanalysis.ai/models/${slug}`
const OPEN_LLM = 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard'
const LIVEBENCH = 'https://livebench.ai/leaderboard/'
// LMSYS Arena & SWE-bench are live-scraped by benchmark_scrapers.ts — no static URL needed here.

// ─── Per-company fallback patterns ───────────────────────────────────────────
// Used when no exact model entry exists — URLs are generated from the model name.

type CompanyPatterns = {
  blog:    (slug: string) => string
  pricing: string
  hf?:     (slug: string) => string
}

const COMPANY_PATTERNS: Record<string, CompanyPatterns> = {
  Anthropic: {
    blog:    slug => `https://www.anthropic.com/news/${slug}`,
    pricing: 'https://www.anthropic.com/pricing',
    hf:      slug => `https://huggingface.co/anthropic/${slug}`,
  },
  OpenAI: {
    blog:    slug => `https://openai.com/blog/${slug}`,
    // openai.com/api/pricing/ returns HTTP 403 for server-side requests (bot protection)
    // Use platform.openai.com/docs/models which is accessible without JS
    pricing: 'https://platform.openai.com/docs/models',
  },
  'Google DeepMind': {
    blog:    slug => `https://deepmind.google/technologies/gemini/${slug}/`,
    pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
    hf:      slug => `https://huggingface.co/google/${slug}`,
  },
  Meta: {
    blog:    slug => `https://ai.meta.com/blog/${slug}/`,
    pricing: 'https://ai.meta.com/llama/',
    hf:      slug => `https://huggingface.co/meta-llama/${slug}`,
  },
  DeepSeek: {
    blog:    slug => `https://api-docs.deepseek.com/news/${slug}`,
    pricing: 'https://platform.deepseek.com/api-docs/pricing',
    hf:      slug => `https://huggingface.co/deepseek-ai/${slug}`,
  },
  'Alibaba / Qwen': {
    blog:    slug => `https://qwenlm.github.io/blog/${slug}/`,
    pricing: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
    hf:      slug => `https://huggingface.co/Qwen/${slug}`,
  },
  // DB company name is 'Alibaba' — alias so getModelSources works with both keys
  Alibaba: {
    blog:    slug => `https://qwenlm.github.io/blog/${slug}/`,
    pricing: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
    hf:      slug => `https://huggingface.co/Qwen/${slug}`,
  },
  xAI: {
    blog:    slug => `https://x.ai/blog/${slug}`,
    pricing: 'https://x.ai/api',
  },
  MiniMax: {
    blog:    slug => `https://www.minimaxi.com/news/${slug}`,
    pricing: 'https://platform.minimaxi.com/document/Price',
    hf:      slug => `https://huggingface.co/MiniMaxAI/${slug}`,
  },
  'Moonshot AI': {
    blog:    slug => `https://kimi.moonshot.cn/${slug}`,
    pricing: 'https://platform.moonshot.cn/docs/pricing/pricing',
    hf:      slug => `https://huggingface.co/moonshotai/${slug}`,
  },
  'Zhipu AI': {
    blog:    slug => `https://zhipuai.cn/news/${slug}`,
    pricing: 'https://open.bigmodel.cn/pricing',
    hf:      slug => `https://huggingface.co/THUDM/${slug}`,
  },
  Xiaomi: {
    blog:    slug => `https://github.com/XiaomiMiMo/${slug}`,
    pricing: 'https://github.com/XiaomiMiMo',
    hf:      slug => `https://huggingface.co/XiaomiMiMo/${slug}`,
  },
  // ── Robotics companies ──────────────────────────────────────────────────────
  'Physical Intelligence': {
    blog:    slug => `https://www.physicalintelligence.company/blog/${slug}`,
    pricing: 'https://www.physicalintelligence.company/',
  },
  NVIDIA: {
    blog:    slug => `https://developer.nvidia.com/blog/${slug}`,
    pricing: 'https://developer.nvidia.com/isaac/foundation-models',
  },
  'Figure AI': {
    blog:    slug => `https://www.figure.ai/news/${slug}`,
    pricing: 'https://www.figure.ai/',
  },
  '1X Technologies': {
    blog:    slug => `https://www.1x.tech/blog/${slug}`,
    pricing: 'https://www.1x.tech/',
  },
  Tesla: {
    blog:    slug => `https://www.tesla.com/blog/${slug}`,
    pricing: 'https://www.tesla.com/optimus',
  },
  银河通用: {
    blog:    slug => `https://www.galaxyrobot.com/news/${slug}`,
    pricing: 'https://www.galaxyrobot.com/',
  },
  星海图: {
    blog:    slug => `https://agibot.com/news/${slug}`,
    pricing: 'https://agibot.com/',
  },
}

// ─── Exact model entries ──────────────────────────────────────────────────────

const MODEL_SOURCES: Record<string, ModelSourceEntry> = {

  // ── OpenAI ───────────────────────────────────────────────────────────────────
  'GPT-4o': {
    primary:    ['https://openai.com/blog/hello-gpt-4o'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-4o'), LIVEBENCH],
  },
  'GPT-4o mini': {
    primary:    ['https://openai.com/blog/gpt-4o-mini-advancing-cost-efficient-intelligence'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-4o-mini'), LIVEBENCH],
  },
  'o1': {
    primary:    ['https://openai.com/blog/openai-o1-system-card'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('o1'), LIVEBENCH],
  },
  'o1-mini': {
    primary:    ['https://openai.com/blog/openai-o1-system-card'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('o1-mini'), LIVEBENCH],
  },
  'o3-mini': {
    primary:    ['https://openai.com/blog/openai-o3-mini'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('o3-mini'), LIVEBENCH],
  },
  'o3': {
    primary:    ['https://openai.com/blog/openai-o3-system-card'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('o3'), LIVEBENCH],
  },
  'o4-mini': {
    primary:    ['https://openai.com/blog/o4-mini'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('o4-mini'), LIVEBENCH],
  },
  'GPT-4.5': {
    primary:    ['https://openai.com/blog/gpt-4-5'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-4-5'), LIVEBENCH],
  },
  'GPT-4.1': {
    primary:    ['https://openai.com/blog/gpt-4-1'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-4-1'), LIVEBENCH],
  },
  'GPT-4.1 mini': {
    primary:    ['https://openai.com/blog/gpt-4-1'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-4-1-mini'), LIVEBENCH],
  },
  'GPT-4.1 nano': {
    primary:    ['https://openai.com/blog/gpt-4-1'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-4-1-nano'), LIVEBENCH],
  },
  'GPT-5': {
    primary:    ['https://openai.com/blog/gpt-5', 'https://openai.com/index/gpt-5'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-5'), LIVEBENCH],
  },
  'GPT-5 mini': {
    primary:    ['https://openai.com/blog/gpt-5', 'https://openai.com/index/gpt-5'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-5-mini'), LIVEBENCH],
  },
  'GPT-5.5': {
    primary:    ['https://openai.com/blog/gpt-5-5', 'https://openai.com/index/gpt-5-5'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-5-5'), LIVEBENCH],
  },
  'GPT-5.5 Instant': {
    primary:    ['https://openai.com/blog/gpt-5-5', 'https://openai.com/index/gpt-5-5'],
    pricing:    ['https://platform.openai.com/docs/models'],
    docs:       ['https://platform.openai.com/docs/models'],
    evals:      [AA('gpt-5-5-instant'), LIVEBENCH],
  },

  // ── Anthropic ───────────────────────────────────────────────────────────────
  'Claude 3 Haiku': {
    primary:    ['https://www.anthropic.com/news/claude-haiku'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-3-haiku'), LIVEBENCH],
  },
  'Claude 3 Sonnet': {
    primary:    ['https://www.anthropic.com/news/claude-3-family'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-3-sonnet'), LIVEBENCH],
  },
  'Claude 3 Opus': {
    primary:    ['https://www.anthropic.com/news/claude-3-family'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-3-opus'), LIVEBENCH],
  },
  'Claude 3.5 Sonnet': {
    primary:    ['https://www.anthropic.com/news/claude-3-5-sonnet'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-3-5-sonnet'), LIVEBENCH],
  },
  'Claude 3.5 Haiku': {
    primary:    ['https://www.anthropic.com/news/claude-3-5-haiku'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-3-5-haiku'), LIVEBENCH],
  },
  'Claude 3.7 Sonnet': {
    primary:    ['https://www.anthropic.com/news/claude-3-7-sonnet'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-3-7-sonnet'), LIVEBENCH],
  },
  'Claude Opus 4.6': {
    primary:    ['https://www.anthropic.com/news/claude-opus-4'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-opus-4'), LIVEBENCH],
  },
  'Claude Opus 4.7': {
    primary:    ['https://www.anthropic.com/news/claude-opus-4'],
    pricing:    ['https://www.anthropic.com/pricing'],
    docs:       ['https://docs.anthropic.com/en/docs/about-claude/models'],
    evals:      [AA('claude-opus-4'), LIVEBENCH],
  },

  // ── Google DeepMind ─────────────────────────────────────────────────────────
  'Gemini 1.5 Pro': {
    primary:    ['https://blog.google/technology/ai/google-gemini-next-generation-model-february-2024/'],
    pricing:    ['https://ai.google.dev/gemini-api/docs/pricing'],
    docs:       ['https://ai.google.dev/gemini-api/docs/models/gemini'],
    evals:      [AA('gemini-1-5-pro'), LIVEBENCH],
  },
  'Gemini 1.5 Flash': {
    primary:    ['https://developers.googleblog.com/en/gemini-1-5-flash-now-available-for-developers-and-businesses/'],
    pricing:    ['https://ai.google.dev/gemini-api/docs/pricing'],
    docs:       ['https://ai.google.dev/gemini-api/docs/models/gemini'],
    evals:      [AA('gemini-1-5-flash'), LIVEBENCH],
  },
  'Gemini 2.0 Flash': {
    primary:    ['https://blog.google/technology/google-deepmind/google-gemini-ai-update-december-2024/'],
    pricing:    ['https://ai.google.dev/gemini-api/docs/pricing'],
    docs:       ['https://ai.google.dev/gemini-api/docs/models/gemini'],
    evals:      [AA('gemini-2-0-flash'), LIVEBENCH],
  },
  'Gemini 2.0 Flash Lite': {
    primary:    ['https://developers.googleblog.com/en/gemini-2-0-flash-lite-is-now-generally-available/'],
    pricing:    ['https://ai.google.dev/gemini-api/docs/pricing'],
    docs:       ['https://ai.google.dev/gemini-api/docs/models/gemini'],
    evals:      [AA('gemini-2-0-flash-lite'), LIVEBENCH],
  },
  'Gemini 2.5 Pro': {
    primary:    ['https://blog.google/technology/google-deepmind/gemini-2-5-pro-io/'],
    pricing:    ['https://ai.google.dev/gemini-api/docs/pricing'],
    docs:       ['https://ai.google.dev/gemini-api/docs/models/gemini'],
    evals:      [AA('gemini-2-5-pro'), LIVEBENCH],
  },
  'Gemini 2.5 Flash': {
    primary:    ['https://developers.googleblog.com/en/gemini-2-5-flash-and-gemini-2-5-pro-now-generally-available/'],
    pricing:    ['https://ai.google.dev/gemini-api/docs/pricing'],
    docs:       ['https://ai.google.dev/gemini-api/docs/models/gemini'],
    evals:      [AA('gemini-2-5-flash'), LIVEBENCH],
  },
  'Gemini 3.1 Pro': {
    primary:    ['https://deepmind.google/technologies/gemini/'],
    pricing:    ['https://ai.google.dev/gemini-api/docs/pricing'],
    docs:       ['https://ai.google.dev/gemini-api/docs/models/gemini'],
    evals:      [AA('gemini-3-1-pro'), LIVEBENCH],
  },
  'Gemma 2 9B': {
    primary:    ['https://developers.googleblog.com/en/gemma-2-is-now-available-to-researchers-and-developers/'],
    pricing:    ['https://ai.google.dev/gemma/docs'],
    huggingface:['https://huggingface.co/google/gemma-2-9b-it'],
    docs:       ['https://ai.google.dev/gemma/docs'],
    evals:      [AA('gemma-2-9b'), OPEN_LLM],
  },
  'Gemma 2 27B': {
    primary:    ['https://developers.googleblog.com/en/gemma-2-is-now-available-to-researchers-and-developers/'],
    pricing:    ['https://ai.google.dev/gemma/docs'],
    huggingface:['https://huggingface.co/google/gemma-2-27b-it'],
    docs:       ['https://ai.google.dev/gemma/docs'],
    evals:      [AA('gemma-2-27b'), OPEN_LLM],
  },
  'Gemma 3 12B': {
    primary:    ['https://developers.googleblog.com/en/gemma-3/'],
    pricing:    ['https://ai.google.dev/gemma/docs'],
    huggingface:['https://huggingface.co/google/gemma-3-12b-it'],
    docs:       ['https://ai.google.dev/gemma/docs'],
    evals:      [AA('gemma-3-12b'), OPEN_LLM],
  },
  'Gemma 3 27B': {
    primary:    ['https://developers.googleblog.com/en/gemma-3/'],
    pricing:    ['https://ai.google.dev/gemma/docs'],
    huggingface:['https://huggingface.co/google/gemma-3-27b-it'],
    docs:       ['https://ai.google.dev/gemma/docs'],
    evals:      [AA('gemma-3-27b'), OPEN_LLM],
  },
  'Gemma 4 E2B': {
    primary:    ['https://developers.googleblog.com/en/gemma-4/'],
    pricing:    ['https://ai.google.dev/gemma/docs'],
    huggingface:['https://huggingface.co/google/gemma-4-e2b-it'],
    docs:       ['https://ai.google.dev/gemma/docs'],
    evals:      [OPEN_LLM],
  },
  'Gemma 4 27B': {
    primary:    ['https://developers.googleblog.com/en/gemma-4/'],
    pricing:    ['https://ai.google.dev/gemma/docs'],
    huggingface:['https://huggingface.co/google/gemma-4-27b-it'],
    docs:       ['https://ai.google.dev/gemma/docs'],
    evals:      [AA('gemma-4-27b'), OPEN_LLM],
  },

  // ── Robotics — Google DeepMind ───────────────────────────────────────────────
  'RT-2': {
    primary:    ['https://deepmind.google/discover/blog/rt-2-new-model-translates-vision-and-language-into-action/'],
    pricing:    ['https://deepmind.google/'],
    arxiv:      ['https://arxiv.org/abs/2307.15818'],
  },
  'Gemini Robotics': {
    primary:    ['https://deepmind.google/discover/blog/gemini-robotics-bringing-ai-into-the-physical-world/'],
    pricing:    ['https://deepmind.google/'],
    arxiv:      ['https://arxiv.org/abs/2503.20020'],
  },

  // ── Meta ─────────────────────────────────────────────────────────────────────
  'Llama 3.1 70B': {
    primary:    ['https://ai.meta.com/blog/meta-llama-3-1/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Meta-Llama-3.1-70B-Instruct'],
    evals:      [AA('llama-3-1-70b'), OPEN_LLM, LIVEBENCH],
  },
  'Llama 3.1 405B': {
    primary:    ['https://ai.meta.com/blog/meta-llama-3-1/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Meta-Llama-3.1-405B-Instruct'],
    evals:      [AA('llama-3-1-405b'), OPEN_LLM, LIVEBENCH],
  },
  'Llama 3.2 3B': {
    primary:    ['https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct'],
    evals:      [OPEN_LLM],
  },
  'Llama 3.2 11B Vision': {
    primary:    ['https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Llama-3.2-11B-Vision-Instruct'],
    evals:      [OPEN_LLM],
  },
  'Llama 3.2 90B Vision': {
    primary:    ['https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Llama-3.2-90B-Vision-Instruct'],
    evals:      [AA('llama-3-2-90b'), OPEN_LLM],
  },
  'Llama 3.3 70B': {
    primary:    ['https://ai.meta.com/blog/meta-llama-3-3/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct'],
    evals:      [AA('llama-3-3-70b'), OPEN_LLM, LIVEBENCH],
  },
  'Llama 4 Scout': {
    primary:    ['https://ai.meta.com/blog/llama-4-multimodal-intelligence/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct'],
    evals:      [AA('llama-4-scout'), OPEN_LLM, LIVEBENCH],
  },
  'Llama 4 Maverick': {
    primary:    ['https://ai.meta.com/blog/llama-4-multimodal-intelligence/'],
    pricing:    ['https://ai.meta.com/llama/'],
    huggingface:['https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct'],
    evals:      [AA('llama-4-maverick'), OPEN_LLM, LIVEBENCH],
  },
  'Muse Spark': {
    primary:    ['https://ai.meta.com/blog/muse-spark-meta-superintelligence-labs/'],
    pricing:    ['https://ai.meta.com/'],
    docs:       ['https://ai.meta.com/'],
  },

  // ── xAI ──────────────────────────────────────────────────────────────────────
  'Grok 3': {
    primary:    ['https://x.ai/blog/grok-3'],
    pricing:    ['https://x.ai/api'],
    docs:       ['https://docs.x.ai/docs'],
    evals:      [AA('grok-3'), LIVEBENCH],
  },
  'Grok 3 Mini': {
    primary:    ['https://x.ai/blog/grok-3'],
    pricing:    ['https://x.ai/api'],
    docs:       ['https://docs.x.ai/docs'],
    evals:      [AA('grok-3-mini'), LIVEBENCH],
  },

  // ── DeepSeek ─────────────────────────────────────────────────────────────────
  'DeepSeek V2.5': {
    primary:    ['https://api-docs.deepseek.com/news/news0905'],
    pricing:    ['https://platform.deepseek.com/api-docs/pricing'],
    huggingface:['https://huggingface.co/deepseek-ai/DeepSeek-V2.5'],
    evals:      [AA('deepseek-v2-5'), OPEN_LLM],
  },
  'DeepSeek V3': {
    primary:    ['https://api-docs.deepseek.com/news/news1226'],
    pricing:    ['https://platform.deepseek.com/api-docs/pricing'],
    huggingface:['https://huggingface.co/deepseek-ai/DeepSeek-V3'],
    arxiv:      ['https://arxiv.org/abs/2412.19437'],
    evals:      [AA('deepseek-v3'), OPEN_LLM, LIVEBENCH],
  },
  'DeepSeek R1': {
    primary:    ['https://api-docs.deepseek.com/news/news250120'],
    pricing:    ['https://platform.deepseek.com/api-docs/pricing'],
    huggingface:['https://huggingface.co/deepseek-ai/DeepSeek-R1'],
    arxiv:      ['https://arxiv.org/abs/2501.12948'],
    evals:      [AA('deepseek-r1'), OPEN_LLM, LIVEBENCH],
  },
  'DeepSeek V3-0324': {
    primary:    ['https://api-docs.deepseek.com/news/news0325'],
    pricing:    ['https://platform.deepseek.com/api-docs/pricing'],
    huggingface:['https://huggingface.co/deepseek-ai/DeepSeek-V3-0324'],
    evals:      [AA('deepseek-v3-0324'), OPEN_LLM, LIVEBENCH],
  },
  'DeepSeek V4-Pro': {
    primary:    ['https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro'],
    pricing:    ['https://platform.deepseek.com/api-docs/pricing'],
    huggingface:['https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro'],
    evals:      [AA('deepseek-v4-pro'), OPEN_LLM, LIVEBENCH],
  },
  'DeepSeek V4-Flash': {
    primary:    ['https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash'],
    pricing:    ['https://platform.deepseek.com/api-docs/pricing'],
    huggingface:['https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash'],
    evals:      [AA('deepseek-v4-flash'), OPEN_LLM],
  },

  // ── Alibaba / Qwen ───────────────────────────────────────────────────────────
  'Qwen2.5 72B': {
    primary:    ['https://qwenlm.github.io/blog/qwen2.5/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen2.5-72B-Instruct'],
    evals:      [AA('qwen-2-5-72b'), OPEN_LLM, LIVEBENCH],
  },
  'Qwen2.5-Coder 32B': {
    primary:    ['https://qwenlm.github.io/blog/qwen2.5-coder/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct'],
    evals:      [OPEN_LLM],
  },
  'Qwen2.5-VL 72B': {
    primary:    ['https://qwenlm.github.io/blog/qwen2.5-vl/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct'],
    evals:      [OPEN_LLM],
  },
  'QwQ-32B': {
    primary:    ['https://qwenlm.github.io/blog/qwq-32b/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/QwQ-32B'],
    evals:      [AA('qwq-32b'), OPEN_LLM, LIVEBENCH],
  },
  'Qwen3 32B': {
    primary:    ['https://qwenlm.github.io/blog/qwen3/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen3-32B'],
    evals:      [AA('qwen3-32b'), OPEN_LLM, LIVEBENCH],
  },
  'Qwen3 72B': {
    primary:    ['https://qwenlm.github.io/blog/qwen3/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen3-72B'],
    evals:      [AA('qwen3-72b'), OPEN_LLM, LIVEBENCH],
  },
  'Qwen3 235B': {
    primary:    ['https://qwenlm.github.io/blog/qwen3/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen3-235B-A22B'],
    evals:      [AA('qwen3-235b'), OPEN_LLM, LIVEBENCH],
  },
  'Qwen3 30B A3B': {
    primary:    ['https://qwenlm.github.io/blog/qwen3/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen3-30B-A3B'],
    evals:      [OPEN_LLM],
  },
  'Qwen3.5-Omni': {
    primary:    ['https://qwenlm.github.io/blog/qwen3.5-omni/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen3.5-Omni'],
    evals:      [OPEN_LLM],
  },
  'Qwen3.6-35B-A3B': {
    primary:    ['https://qwenlm.github.io/blog/qwen3.6/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen3.6-35B-A3B'],
    evals:      [OPEN_LLM],
  },
  'Qwen3.6-27B': {
    primary:    ['https://qwenlm.github.io/blog/qwen3.6/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    huggingface:['https://huggingface.co/Qwen/Qwen3.6-27B'],
    evals:      [OPEN_LLM],
  },
  'Qwen3.6-Plus': {
    primary:    ['https://qwenlm.github.io/blog/qwen3.6/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    docs:       ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
  },
  'Qwen3.6-Max': {
    primary:    ['https://qwenlm.github.io/blog/qwen3.6/'],
    pricing:    ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
    docs:       ['https://help.aliyun.com/zh/model-studio/getting-started/models'],
  },

  // ── MiniMax ───────────────────────────────────────────────────────────────────
  'MiniMax-Text-01': {
    primary:    ['https://www.minimaxi.com/news/'],
    pricing:    ['https://platform.minimaxi.com/document/Price'],
    huggingface:['https://huggingface.co/MiniMaxAI/MiniMax-Text-01'],
    docs:       ['https://platform.minimaxi.com/document/Guides'],
    evals:      [AA('minimax-text-01'), OPEN_LLM],
  },
  'MiniMax M2.5': {
    primary:    ['https://www.minimaxi.com/news/'],
    pricing:    ['https://platform.minimaxi.com/document/Price'],
    huggingface:['https://huggingface.co/MiniMaxAI/MiniMax-M1-80k'],
    docs:       ['https://platform.minimaxi.com/document/Guides'],
    evals:      [AA('minimax-m2-5'), OPEN_LLM],
  },
  'MiniMax M2.7': {
    primary:    ['https://www.minimaxi.com/news/'],
    pricing:    ['https://platform.minimaxi.com/document/Price'],
    docs:       ['https://platform.minimaxi.com/document/Guides'],
    evals:      [LIVEBENCH],
  },

  // ── Moonshot AI ───────────────────────────────────────────────────────────────
  'Kimi k1.5': {
    primary:    ['https://kimi.moonshot.cn/'],
    pricing:    ['https://platform.moonshot.cn/docs/pricing/pricing'],
    arxiv:      ['https://arxiv.org/abs/2501.12599'],
    docs:       ['https://platform.moonshot.cn/docs/api/chat'],
    evals:      [AA('kimi-k1-5'), LIVEBENCH],
  },
  'Kimi K2.5': {
    primary:    ['https://kimi.moonshot.cn/'],
    pricing:    ['https://platform.moonshot.cn/docs/pricing/pricing'],
    huggingface:['https://huggingface.co/moonshotai/Kimi-K2-Instruct'],
    docs:       ['https://platform.moonshot.cn/docs/api/chat'],
    evals:      [AA('kimi-k2'), OPEN_LLM, LIVEBENCH],
  },
  'Kimi K2.6': {
    primary:    ['https://kimi.moonshot.cn/'],
    pricing:    ['https://platform.moonshot.cn/docs/pricing/pricing'],
    huggingface:['https://huggingface.co/moonshotai/Kimi-K2-Instruct'],
    docs:       ['https://platform.moonshot.cn/docs/api/chat'],
    evals:      [AA('kimi-k2'), OPEN_LLM, LIVEBENCH],
  },

  // ── Zhipu AI ──────────────────────────────────────────────────────────────────
  'GLM-4-Plus': {
    primary:    ['https://zhipuai.cn/'],
    pricing:    ['https://open.bigmodel.cn/pricing'],
    docs:       ['https://open.bigmodel.cn/dev/api'],
    evals:      [LIVEBENCH],
  },
  'GLM-4V-Plus': {
    primary:    ['https://zhipuai.cn/'],
    pricing:    ['https://open.bigmodel.cn/pricing'],
    docs:       ['https://open.bigmodel.cn/dev/api'],
  },
  'GLM-5': {
    primary:    ['https://zhipuai.cn/'],
    pricing:    ['https://open.bigmodel.cn/pricing'],
    huggingface:['https://huggingface.co/THUDM/GLM-Z1-32B-0414'],
    docs:       ['https://open.bigmodel.cn/dev/api'],
    evals:      [OPEN_LLM, LIVEBENCH],
  },
  'GLM-5.1': {
    primary:    ['https://zhipuai.cn/'],
    pricing:    ['https://open.bigmodel.cn/pricing'],
    huggingface:['https://huggingface.co/THUDM/'],
    docs:       ['https://open.bigmodel.cn/dev/api'],
  },

  // ── StepFun ───────────────────────────────────────────────────────────────────
  'Step-1V': {
    primary:    ['https://www.stepfun.com/'],
    pricing:    ['https://platform.stepfun.com/docs/pricing/list'],
    docs:       ['https://platform.stepfun.com/docs/api'],
  },
  'Step-2': {
    primary:    ['https://www.stepfun.com/'],
    pricing:    ['https://platform.stepfun.com/docs/pricing/list'],
    docs:       ['https://platform.stepfun.com/docs/api'],
    evals:      [LIVEBENCH],
  },

  // ── Xiaomi ────────────────────────────────────────────────────────────────────
  'MiMo-7B': {
    primary:    ['https://github.com/XiaomiMiMo/MiMo'],
    pricing:    ['https://github.com/XiaomiMiMo/MiMo'],
    huggingface:['https://huggingface.co/XiaomiMiMo/MiMo-7B-RL'],
    evals:      [OPEN_LLM],
  },

  // ── Physical Intelligence ─────────────────────────────────────────────────────
  'pi0': {
    primary:    ['https://www.physicalintelligence.company/blog/pi0'],
    pricing:    ['https://www.physicalintelligence.company/'],
    arxiv:      ['https://arxiv.org/abs/2410.24164'],
  },
  'pi0.5': {
    primary:    ['https://www.physicalintelligence.company/blog/pi05'],
    pricing:    ['https://www.physicalintelligence.company/'],
    arxiv:      ['https://arxiv.org/abs/2504.16054'],
  },

  // ── NVIDIA ────────────────────────────────────────────────────────────────────
  'GR00T N1': {
    primary:    ['https://developer.nvidia.com/blog/nvidia-gr00t-n1-open-foundation-model-for-humanoid-robots/'],
    pricing:    ['https://developer.nvidia.com/isaac/foundation-models'],
    arxiv:      ['https://arxiv.org/abs/2503.14734'],
  },
  'GR00T N1.5': {
    primary:    ['https://developer.nvidia.com/blog/nvidia-gr00t-n1-5-enhanced-humanoid-robot-foundation-model/'],
    pricing:    ['https://developer.nvidia.com/isaac/foundation-models'],
  },

  // ── Figure AI ─────────────────────────────────────────────────────────────────
  'Helix': {
    primary:    ['https://www.figure.ai/news/helix'],
    pricing:    ['https://www.figure.ai/'],
  },

  // ── 1X Technologies ───────────────────────────────────────────────────────────
  'World Model': {
    primary:    ['https://www.1x.tech/discover/1x-world-model'],
    pricing:    ['https://www.1x.tech/'],
  },

  // ── Tesla ─────────────────────────────────────────────────────────────────────
  'Optimus Gen 2': {
    primary:    ['https://www.tesla.com/optimus'],
    pricing:    ['https://www.tesla.com/optimus'],
  },

  // ── 银河通用 (Galbot) ──────────────────────────────────────────────────────────
  'Galbot G1': {
    primary:    ['https://www.galaxyrobot.com/'],
    pricing:    ['https://www.galaxyrobot.com/'],
  },

  // ── 星海图 (AgiBot) ────────────────────────────────────────────────────────────
  'AgiBot World Model': {
    primary:    ['https://agibot.com/'],
    pricing:    ['https://agibot.com/'],
    huggingface:['https://huggingface.co/agibot-world/AgiBot-World-Llama3-8B-Ins'],
    arxiv:      ['https://arxiv.org/abs/2503.06669'],
  },

  // ── Wayve ─────────────────────────────────────────────────────────────────────
  'GAIA-1': {
    primary:    ['https://wayve.ai/thinking/introducing-gaia1/'],
    pricing:    ['https://wayve.ai/'],
    arxiv:      ['https://arxiv.org/abs/2309.17080'],
  },
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the source entry for a model.
 * Falls back to company-pattern-generated URLs if no exact entry exists.
 */
export function getModelSources(modelName: string, company?: string): ModelSourceEntry | null {
  // 1. Exact match
  if (MODEL_SOURCES[modelName]) return MODEL_SOURCES[modelName]

  // 2. Partial match (e.g. "Claude 3.7 Sonnet (20250219)" → "Claude 3.7 Sonnet")
  // Only match when the model name STARTS WITH a known registry key (avoids false
  // positives like "EMMA 2" matching inside "Gemma 2 9B").
  const partial = Object.keys(MODEL_SOURCES).find(k =>
    modelName.toLowerCase().startsWith(k.toLowerCase())
  )
  if (partial) return MODEL_SOURCES[partial]

  // 3. Generate from company pattern
  if (company && COMPANY_PATTERNS[company]) {
    const pat = COMPANY_PATTERNS[company]
    const slug = modelName.toLowerCase().replace(/[\s\-_/]+/g, '-').replace(/\.(?!\d)/g, ' ').replace(/[^a-z0-9-.]/g, '')
    return {
      primary: [pat.blog(slug)],
      pricing: [pat.pricing],
      huggingface: pat.hf ? [pat.hf(slug)] : undefined,
    }
  }

  return null
}

/**
 * Returns all unique URLs for a model, ordered by priority (primary first).
 */
export function getModelUrls(modelName: string, company?: string): string[] {
  const entry = getModelSources(modelName, company)
  if (!entry) return []
  return [
    ...entry.primary,
    ...entry.pricing,
    ...(entry.docs ?? []),
    ...(entry.huggingface ?? []),
    ...(entry.arxiv ?? []),
    ...(entry.evals ?? []),
  ]
}

/**
 * Returns the best URL for a specific field group.
 */
export function getFieldUrl(modelName: string, company: string | undefined, group: FieldGroup): string | null {
  const entry = getModelSources(modelName, company)
  if (!entry) return null
  switch (group) {
    case 'pricing':      return entry.pricing[0] ?? null
    case 'benchmarks':   return entry.evals?.[0] ?? entry.primary[0] ?? null
    case 'architecture': return entry.arxiv?.[0] ?? entry.huggingface?.[0] ?? entry.primary[0] ?? null
    default:             return entry.primary[0] ?? null
  }
}
