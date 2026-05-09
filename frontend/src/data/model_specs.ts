/**
 * Canonical model specifications — ground truth for params, context_window, license.
 *
 * PURPOSE: prevent LLM-extraction hallucinations for fields that are factually known.
 *   - params:          dense "70B"; MoE "671B-A37B" (total-active, hyphen-A format)
 *   - context_window:  "128K" / "1M" / "10M" etc.
 *   - license:         "open" | "closed" | "partial"
 *
 * Used by:
 *   1. /api/models/create   — overrides LLM-extracted values at insert time
 *   2. /api/models/[id]     — overrides on PATCH update
 *   3. /api/admin/repair-specs — batch-repair existing DB rows
 *   4. field_validator.ts   — warns when extracted value contradicts known spec
 *
 * MAINTENANCE: add new entries here when a model's specs are officially confirmed.
 * Do NOT add approximate values (e.g. "~671B") — only confirmed published specs.
 */

export interface ModelSpec {
  params?: string                          // e.g. "671B-A37B" or "70B"
  context_window?: string                  // e.g. "128K", "1M", "10M"
  license?: 'open' | 'closed' | 'partial'
}

export const MODEL_SPECS: Record<string, ModelSpec> = {

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  'GPT-4o':       { context_window: '128K', license: 'closed' },
  'GPT-4o mini':  { context_window: '128K', license: 'closed' },
  'o1':           { context_window: '200K', license: 'closed' },
  'o1-mini':      { context_window: '128K', license: 'closed' },
  'o3-mini':      { context_window: '200K', license: 'closed' },
  'o3':           { context_window: '200K', license: 'closed' },
  'o4-mini':      { context_window: '200K', license: 'closed' },
  'GPT-4.5':      { context_window: '128K', license: 'closed' },
  'GPT-4.1':      { context_window: '1M',   license: 'closed' },
  'GPT-4.1 mini': { context_window: '1M',   license: 'closed' },
  'GPT-4.1 nano': { context_window: '1M',   license: 'closed' },

  // ── Anthropic ──────────────────────────────────────────────────────────────
  'Claude 3 Haiku':    { context_window: '200K', license: 'closed' },
  'Claude 3 Sonnet':   { context_window: '200K', license: 'closed' },
  'Claude 3 Opus':     { context_window: '200K', license: 'closed' },
  'Claude 3.5 Sonnet': { context_window: '200K', license: 'closed' },
  'Claude 3.5 Haiku':  { context_window: '200K', license: 'closed' },
  'Claude 3.7 Sonnet': { context_window: '200K', license: 'closed' },
  'Claude Opus 4.6':   { context_window: '200K', license: 'closed' },
  'Claude Opus 4.7':   { context_window: '200K', license: 'closed' },

  // ── Google DeepMind ────────────────────────────────────────────────────────
  'Gemini 1.5 Pro':        { context_window: '1M',   license: 'closed' },
  'Gemini 1.5 Flash':      { context_window: '1M',   license: 'closed' },
  'Gemini 2.0 Flash':      { context_window: '1M',   license: 'closed' },
  'Gemini 2.0 Flash Lite': { context_window: '1M',   license: 'closed' },
  'Gemini 2.5 Pro':        { context_window: '1M',   license: 'closed' },
  'Gemini 2.5 Flash':      { context_window: '1M',   license: 'closed' },
  'Gemini 3.1 Pro':        { context_window: '1M',   license: 'closed' },
  'Gemma 2 9B':            { params: '9B',  context_window: '8K',   license: 'open' },
  'Gemma 2 27B':           { params: '27B', context_window: '8K',   license: 'open' },
  'Gemma 3 12B':           { params: '12B', context_window: '128K', license: 'open' },
  'Gemma 3 27B':           { params: '27B', context_window: '128K', license: 'open' },
  'Gemma 4 E2B':           { params: '2B',  context_window: '128K', license: 'open' },
  'Gemma 4 27B':           { params: '27B', context_window: '128K', license: 'open' },

  // ── Meta ───────────────────────────────────────────────────────────────────
  'Llama 3.1 70B':        { params: '70B',       context_window: '128K', license: 'open' },
  'Llama 3.1 405B':       { params: '405B',      context_window: '128K', license: 'open' },
  'Llama 3.2 3B':         { params: '3B',        context_window: '128K', license: 'open' },
  'Llama 3.2 11B Vision': { params: '11B',       context_window: '128K', license: 'open' },
  'Llama 3.2 90B Vision': { params: '90B',       context_window: '128K', license: 'open' },
  'Llama 3.3 70B':        { params: '70B',       context_window: '128K', license: 'open' },
  'Llama 4 Scout':        { params: '109B-A17B', context_window: '10M',  license: 'open' },
  'Llama 4 Maverick':     { params: '400B-A17B', context_window: '1M',   license: 'open' },

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  'DeepSeek V2.5':    { params: '236B-A21B', context_window: '128K', license: 'open' },
  'DeepSeek V3':      { params: '671B-A37B', context_window: '128K', license: 'open' },
  'DeepSeek R1':      { params: '671B-A37B', context_window: '128K', license: 'open' },
  'DeepSeek V3-0324': { params: '671B-A37B', context_window: '128K', license: 'open' },
  // V4 generation — MoE architecture continuing DeepSeek's sparse expert line
  'DeepSeek V4-Pro':   { params: '671B-A37B', context_window: '128K', license: 'open' },
  'DeepSeek V4-Flash': { params: '236B-A21B', context_window: '128K', license: 'open' },

  // ── Alibaba / Qwen ─────────────────────────────────────────────────────────
  'Qwen2.5 72B':       { params: '72B',       context_window: '128K', license: 'open' },
  'Qwen2.5-Coder 32B': { params: '32B',       context_window: '128K', license: 'open' },
  'Qwen2.5-VL 72B':    { params: '72B',       context_window: '128K', license: 'open' },
  'QwQ-32B':           { params: '32B',       context_window: '128K', license: 'open' },
  'Qwen3 32B':         { params: '32B',       context_window: '128K', license: 'open' },
  'Qwen3 72B':         { params: '72B',       context_window: '128K', license: 'open' },
  'Qwen3 235B':        { params: '235B-A22B', context_window: '128K', license: 'open' },
  'Qwen3 30B A3B':     { params: '30B-A3B',   context_window: '128K', license: 'open' },
  // Qwen3.5 / Qwen3.6 series
  'Qwen3.5-Omni':      { context_window: '128K', license: 'open' },
  'Qwen3.6-35B-A3B':   { params: '35B-A3B',   context_window: '128K', license: 'open' },
  'Qwen3.6-27B':       { params: '27B',        context_window: '128K', license: 'open' },
  'Qwen3.6-Plus':      { context_window: '128K', license: 'closed' },
  'Qwen3.6-Max':       { context_window: '128K', license: 'closed' },

  // ── MiniMax ────────────────────────────────────────────────────────────────
  'MiniMax-Text-01': { params: '456B-A45.9B', context_window: '1M',   license: 'open' },
  'MiniMax M2.5':    { params: '229B-A10B',   context_window: '1M',   license: 'open' },

  // ── Moonshot AI ────────────────────────────────────────────────────────────
  'Kimi k1.5':  { context_window: '128K', license: 'closed' },
  'Kimi K2.5':  { params: '1.04T-A32B', context_window: '256K', license: 'open' },
  'Kimi K2.6':  { params: '1.04T-A32B', context_window: '256K', license: 'open' },

  // ── Zhipu AI ───────────────────────────────────────────────────────────────
  'GLM-4-Plus':  { context_window: '128K', license: 'closed' },
  'GLM-4V-Plus': { context_window: '8K',   license: 'closed' },
  'GLM-5':       { params: '744B-A40B', context_window: '202K', license: 'open' },
  'GLM-5.1':     { context_window: '128K', license: 'open' },

  // ── xAI ────────────────────────────────────────────────────────────────────
  'Grok 3':      { context_window: '131K', license: 'closed' },
  'Grok 3 Mini': { context_window: '131K', license: 'closed' },

  // ── Xiaomi ─────────────────────────────────────────────────────────────────
  'MiMo-7B':          { params: '7B', context_window: '32K', license: 'open' },
  'MiMo-Embodied-7B': { context_window: '1M', license: 'open', params: '7B' },

  // ── Physical Intelligence ──────────────────────────────────────────────────
  'pi0':   { params: '3B', license: 'closed' },
  'pi0.5': { params: '3B', license: 'closed' },

  // ── Wayve ──────────────────────────────────────────────────────────────────
  'GAIA-1': { params: '9B', license: 'closed' },
  'Mistral-Medium-3.5-128B': { context_window: '256k', params: '128B' },
  'MiMo-V2.5-Pro': { context_window: '1M', params: '1T' },
}

/**
 * Apply canonical specs on top of an extracted/submitted model object.
 * Only overrides fields that are defined in MODEL_SPECS (undefined = don't touch).
 */
export function applyCanonicalSpecs<T extends {
  name?: string | null
  params?: string | null
  context_window?: string | null
  license?: string | null
}>(model: T): T {
  const spec = MODEL_SPECS[(model.name ?? '').trim()]
  if (!spec) return model
  return {
    ...model,
    ...(spec.params           !== undefined ? { params:          spec.params           } : {}),
    ...(spec.context_window   !== undefined ? { context_window:  spec.context_window   } : {}),
    ...(spec.license          !== undefined ? { license:         spec.license          } : {}),
  }
}
