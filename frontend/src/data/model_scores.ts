/**
 * 标准化能力评分 — 6 个维度，统一 0–100 分
 *
 * coding       SWE-bench / HumanEval（编程实测）
 * agentic      工具调用 / 多步规划 / GAIA / tau-bench（智能体任务）
 * multimodal   MMMU / visual QA（跨模态理解，纯文本模型为 0）
 * reasoning    MMLU / ARC-AGI / GPQA Diamond（通用逻辑推理）
 * math         MATH-500 / AIME（数学 & 数据分析）
 * hallucination TruthfulQA / SimpleQA 取反（越高越可信，幻觉越少）
 *
 * 数据来源：官方发布 benchmark + Artificial Analysis + LMSYS Chatbot Arena
 * 最后更新：2026-04-26
 */

export type ScoreDim = 'coding' | 'agentic' | 'multimodal' | 'reasoning' | 'math' | 'hallucination'

export interface DimMeta { label: string; abbr: string; color: string }

export const DIM_META: Record<ScoreDim, DimMeta> = {
  coding:        { label: 'Coding',       abbr: 'Code', color: '#1D9E75' },
  agentic:       { label: 'Agentic',      abbr: 'Agnt', color: '#7C3AED' },
  multimodal:    { label: 'Multimodal',   abbr: 'Mltm', color: '#D97706' },
  reasoning:     { label: 'Reasoning',    abbr: 'Rsn',  color: '#185FA5' },
  math:          { label: 'Math / Data',  abbr: 'Math', color: '#E24B4A' },
  hallucination: { label: 'Trust',        abbr: 'Trst', color: '#0891B2' },
}

export const DIM_ORDER: ScoreDim[] = ['coding', 'agentic', 'multimodal', 'reasoning', 'math', 'hallucination']

export type Scores = Partial<Record<ScoreDim, number>>

export const MODEL_SCORES: Record<string, Scores> = {

  // ── OpenAI ───────────────────────────────────────────────────────────────
  'GPT-4o':           { coding:33, agentic:60, multimodal:69, reasoning:87, math:77, hallucination:72 },
  'GPT-4o mini':      { coding:22, agentic:45, multimodal:60, reasoning:82, math:70, hallucination:68 },
  'o1-mini':          { coding:35, agentic:55, multimodal: 0, reasoning:85, math:90, hallucination:79 },
  'o1':               { coding:49, agentic:65, multimodal:55, reasoning:92, math:96, hallucination:82 },
  'o1-pro':           { coding:51, agentic:68, multimodal:60, reasoning:93, math:97, hallucination:84 },
  'o3-mini':          { coding:49, agentic:63, multimodal: 0, reasoning:87, math:93, hallucination:80 },
  'o3':               { coding:72, agentic:78, multimodal:60, reasoning:91, math:98, hallucination:85 },
  'o4-mini':          { coding:68, agentic:74, multimodal:58, reasoning:90, math:95, hallucination:82 },
  'GPT-4.5':          { coding:38, agentic:62, multimodal:78, reasoning:90, math:82, hallucination:80 },
  'GPT-4.1':          { coding:55, agentic:72, multimodal:79, reasoning:90, math:84, hallucination:78 },
  'GPT-4.1 mini':     { coding:23, agentic:48, multimodal:65, reasoning:83, math:75, hallucination:73 },
  'GPT-4.1 nano':     { coding:15, agentic:38, multimodal:58, reasoning:80, math:68, hallucination:70 },
  'GPT-5.4':          { coding:67, agentic:80, multimodal:88, reasoning:92, math:92, hallucination:85 },

  // ── Anthropic ────────────────────────────────────────────────────────────
  'Claude 3 Haiku':     { coding:18, agentic:42, multimodal:52, reasoning:75, math:63, hallucination:76 },
  'Claude 3 Sonnet':    { coding:25, agentic:52, multimodal:60, reasoning:79, math:72, hallucination:78 },
  'Claude 3 Opus':      { coding:28, agentic:58, multimodal:65, reasoning:86, math:78, hallucination:80 },
  'Claude 3.5 Sonnet':  { coding:49, agentic:71, multimodal:68, reasoning:89, math:78, hallucination:85 },
  'Claude 3.5 Haiku':   { coding:40, agentic:63, multimodal:58, reasoning:82, math:72, hallucination:82 },
  'Claude 3.7 Sonnet':  { coding:70, agentic:78, multimodal:70, reasoning:90, math:87, hallucination:87 },
  'Claude Opus 4.6':    { coding:72, agentic:80, multimodal:72, reasoning:90, math:88, hallucination:88 },
  'Claude Opus 4.7':    { coding:74, agentic:82, multimodal:74, reasoning:91, math:89, hallucination:88 },

  // ── Google DeepMind ──────────────────────────────────────────────────────
  'Gemini 1.5 Pro':         { coding:38, agentic:60, multimodal:75, reasoning:86, math:78, hallucination:74 },
  'Gemini 1.5 Flash':       { coding:25, agentic:48, multimodal:67, reasoning:79, math:70, hallucination:70 },
  'Gemini 2.0 Flash':       { coding:52, agentic:55, multimodal:78, reasoning:76, math:74, hallucination:72 },
  'Gemini 2.0 Flash Lite':  { coding:20, agentic:42, multimodal:68, reasoning:73, math:65, hallucination:68 },
  'Gemini 2.5 Pro':         { coding:64, agentic:73, multimodal:88, reasoning:92, math:91, hallucination:83 },
  'Gemini 2.5 Flash':       { coding:53, agentic:68, multimodal:82, reasoning:89, math:86, hallucination:80 },
  'Gemini 3.1 Pro':         { coding:68, agentic:76, multimodal:91, reasoning:91, math:90, hallucination:83 },
  'Gemma 2 27B':            { coding:35, agentic:50, multimodal: 0, reasoning:78, math:70, hallucination:72 },
  'Gemma 2 9B':             { coding:22, agentic:38, multimodal: 0, reasoning:70, math:60, hallucination:68 },
  'Gemma 3 12B':            { coding:28, agentic:45, multimodal:62, reasoning:73, math:64, hallucination:70 },
  'Gemma 3 27B':            { coding:35, agentic:52, multimodal:65, reasoning:79, math:72, hallucination:73 },
  'Gemma 4 E2B':            { coding:12, agentic:28, multimodal:55, reasoning:56, math:45, hallucination:63 },
  'Gemma 4 27B':            { coding:38, agentic:55, multimodal:68, reasoning:83, math:76, hallucination:74 },

  // ── Meta ─────────────────────────────────────────────────────────────────
  'Muse Spark':            { coding:45, agentic:72, multimodal:78, reasoning:85, math:78, hallucination:76 },
  'Llama 3.1 70B':         { coding:35, agentic:52, multimodal: 0, reasoning:83, math:72, hallucination:72 },
  'Llama 3.1 405B':        { coding:45, agentic:60, multimodal: 0, reasoning:87, math:80, hallucination:75 },
  'Llama 3.2 3B':          { coding:10, agentic:25, multimodal:52, reasoning:60, math:45, hallucination:62 },
  'Llama 3.2 11B Vision':  { coding:18, agentic:38, multimodal:68, reasoning:73, math:58, hallucination:68 },
  'Llama 3.2 90B Vision':  { coding:38, agentic:55, multimodal:75, reasoning:83, math:72, hallucination:74 },
  'Llama 3.3 70B':         { coding:40, agentic:58, multimodal: 0, reasoning:84, math:75, hallucination:73 },
  'Llama 4 Scout':         { coding:58, agentic:65, multimodal:74, reasoning:83, math:79, hallucination:75 },
  'Llama 4 Maverick':      { coding:62, agentic:68, multimodal:76, reasoning:85, math:82, hallucination:77 },

  // ── Mistral AI ───────────────────────────────────────────────────────────
  'Mixtral 8x22B':     { coding:25, agentic:45, multimodal: 0, reasoning:77, math:65, hallucination:68 },
  'Mistral Nemo':      { coding:20, agentic:38, multimodal: 0, reasoning:68, math:58, hallucination:65 },
  'Pixtral 12B':       { coding:25, agentic:42, multimodal:65, reasoning:72, math:62, hallucination:68 },
  'Mistral Large 2':   { coding:38, agentic:55, multimodal: 0, reasoning:84, math:76, hallucination:73 },
  'Codestral 2501':    { coding:58, agentic:62, multimodal: 0, reasoning:79, math:79, hallucination:70 },
  'Mistral Small 3.1': { coding:28, agentic:48, multimodal:58, reasoning:75, math:68, hallucination:70 },
  'Mistral Small 3.2': { coding:30, agentic:50, multimodal:60, reasoning:76, math:70, hallucination:71 },
  'Mistral Medium 3':  { coding:35, agentic:55, multimodal:58, reasoning:79, math:73, hallucination:72 },
  'Mistral Small 4':   { coding:35, agentic:52, multimodal:60, reasoning:81, math:72, hallucination:72 },

  // ── DeepSeek ─────────────────────────────────────────────────────────────
  'DeepSeek V2.5':    { coding:38, agentic:58, multimodal: 0, reasoning:80, math:85, hallucination:70 },
  'DeepSeek V3':      { coding:42, agentic:63, multimodal: 0, reasoning:88, math:90, hallucination:74 },
  'DeepSeek R1':      { coding:49, agentic:65, multimodal: 0, reasoning:90, math:97, hallucination:72 },
  'DeepSeek V3-0324': { coding:45, agentic:64, multimodal: 0, reasoning:88, math:91, hallucination:74 },
  'DeepSeek V4-Pro':  { coding:55, agentic:68, multimodal: 0, reasoning:90, math:94, hallucination:75 },
  'DeepSeek V4-Flash':{ coding:38, agentic:55, multimodal: 0, reasoning:82, math:87, hallucination:72 },

  // ── Alibaba / Qwen ───────────────────────────────────────────────────────
  'Qwen2.5 72B':        { coding:40, agentic:60, multimodal: 0, reasoning:86, math:83, hallucination:73 },
  'Qwen2.5-Coder 32B':  { coding:65, agentic:65, multimodal: 0, reasoning:80, math:82, hallucination:70 },
  'Qwen2.5-VL 72B':     { coding:38, agentic:55, multimodal:78, reasoning:84, math:80, hallucination:72 },
  'QwQ-32B':            { coding:45, agentic:60, multimodal: 0, reasoning:85, math:92, hallucination:72 },
  'Qwen3 32B':          { coding:58, agentic:67, multimodal: 0, reasoning:87, math:88, hallucination:74 },
  'Qwen3 72B':          { coding:62, agentic:70, multimodal: 0, reasoning:89, math:91, hallucination:75 },
  'Qwen3 235B':         { coding:65, agentic:72, multimodal: 0, reasoning:91, math:94, hallucination:76 },
  'Qwen3 30B A3B':      { coding:55, agentic:65, multimodal: 0, reasoning:86, math:89, hallucination:73 },
  'Qwen3.5-Omni':       { coding:40, agentic:52, multimodal:72, reasoning:81, math:78, hallucination:72 },
  'Qwen3.6-35B-A3B':    { coding:55, agentic:63, multimodal: 0, reasoning:84, math:87, hallucination:73 },
  'Qwen3.6-27B':        { coding:52, agentic:61, multimodal: 0, reasoning:84, math:86, hallucination:73 },
  'Qwen3.6-Plus':       { coding:60, agentic:68, multimodal: 0, reasoning:87, math:90, hallucination:74 },
  'Qwen3.6-Max':        { coding:65, agentic:73, multimodal: 0, reasoning:90, math:93, hallucination:76 },

  // ── MiniMax ──────────────────────────────────────────────────────────────
  'MiniMax-Text-01':  { coding:35, agentic:55, multimodal: 0, reasoning:89, math:75, hallucination:70 },
  'MiniMax M2.5':     { coding:80, agentic:82, multimodal: 0, reasoning:85, math:78, hallucination:72 },
  'MiniMax M2.7':     { coding:82, agentic:84, multimodal: 0, reasoning:86, math:80, hallucination:73 },

  // ── Zhipu AI ─────────────────────────────────────────────────────────────
  'GLM-4-Plus':   { coding:30, agentic:50, multimodal: 0, reasoning:78, math:70, hallucination:70 },
  'GLM-4V-Plus':  { coding:28, agentic:48, multimodal:72, reasoning:76, math:65, hallucination:68 },
  'GLM-5':        { coding:77, agentic:79, multimodal: 0, reasoning:87, math:84, hallucination:73 },
  'GLM-5.1':      { coding:35, agentic:52, multimodal: 0, reasoning:77, math:70, hallucination:69 },

  // ── Moonshot AI ──────────────────────────────────────────────────────────
  'Kimi k1.5':  { coding:32, agentic:55, multimodal: 0, reasoning:77, math:80, hallucination:70 },
  'Kimi K2.5':  { coding:61, agentic:72, multimodal:65, reasoning:88, math:85, hallucination:73 },
  'Kimi K2.6':  { coding:63, agentic:74, multimodal:65, reasoning:87, math:86, hallucination:74 },

  // ── Amazon ───────────────────────────────────────────────────────────────
  'Nova Pro':   { coding:30, agentic:50, multimodal:72, reasoning:80, math:70, hallucination:72 },
  'Nova Lite':  { coding:18, agentic:38, multimodal:65, reasoning:72, math:60, hallucination:68 },

  // ── xAI ──────────────────────────────────────────────────────────────────
  'Grok 3':      { coding:53, agentic:65, multimodal: 0, reasoning:88, math:87, hallucination:74 },
  'Grok 3 Mini': { coding:35, agentic:55, multimodal: 0, reasoning:85, math:83, hallucination:73 },

  // ── Baidu ────────────────────────────────────────────────────────────────
  'ERNIE 4.5':  { coding:28, agentic:48, multimodal:65, reasoning:84, math:72, hallucination:70 },

  // ── Xiaomi ───────────────────────────────────────────────────────────────
  'MiMo-7B':  { coding:32, agentic:42, multimodal: 0, reasoning:72, math:80, hallucination:72 },

  // ── Embodied / World Models ──────────────────────────────────────────────
  // 用"能力维度"重映射：coding→task, agentic→planning, multimodal→perception, reasoning→decision, math→0, hallucination→reliability
  'pi0.5':  { coding: 0, agentic:82, multimodal:85, reasoning:70, math: 0, hallucination:75 },
  'GAIA-2': { coding: 0, agentic:71, multimodal:80, reasoning:62, math: 0, hallucination:68 },
  'EMMA 2': { coding: 0, agentic:76, multimodal:78, reasoning:65, math: 0, hallucination:70 },

  // ── Static "future" models from LLM_MODELS ──────────────────────────────
  // (Gemini 3.1 Pro is already defined above in the Google section)
  'Test Model ABC': { coding:60, multimodal:0, reasoning:82, math:75 },
  'Mistral-Medium-3.5-128B': { multimodal:0 },
}

/**
 * Merge capability scores — priority:
 *   1. model.cap_scores  (model_capability_scores table, written at ingest)
 *   2. DB benchmark dims (swe/mmlu/db_* computed in /api/models from model_benchmarks)
 *   3. Static MODEL_SCORES  (fallback for models not yet ingested via new pipeline)
 *
 * model fields read from DB (set by /api/models):
 *   cap_scores: { coding, agentic, multimodal, reasoning, math, hallucination }
 *   swe, mmlu, db_math, db_hallucination, db_agentic, db_multimodal, db_reasoning2
 */
export function getCapabilityScores(model: any): Record<ScoreDim, number | null> {
  const cap  = model.cap_scores ?? {}
  const base: Scores = MODEL_SCORES[model.name] ?? {}
  return {
    coding:        cap.coding        ?? model.swe              ?? base.coding        ?? null,
    agentic:       cap.agentic       ?? model.db_agentic       ?? base.agentic       ?? null,
    multimodal:    cap.multimodal    ?? model.db_multimodal    ?? base.multimodal    ?? null,
    reasoning:     cap.reasoning     ?? model.mmlu             ?? model.db_reasoning2 ?? base.reasoning     ?? null,
    math:          cap.math          ?? model.db_math          ?? base.math          ?? null,
    hallucination: cap.hallucination ?? model.db_hallucination ?? base.hallucination ?? null,
  }
}
