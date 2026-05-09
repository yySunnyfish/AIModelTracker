/**
 * Field Validator — schema range checks + anomaly detection.
 *
 * Returns a ValidationResult per field so the UI can highlight problems
 * without blocking the save (warnings vs. errors).
 *
 * Error   = value is clearly wrong, must be fixed before saving.
 * Warning = value looks suspicious, user should verify.
 * Ok      = passes all checks.
 */

import type { ExtractedModel } from './extractor'
import { MODEL_SPECS } from '@/data/model_specs'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationStatus = 'ok' | 'warning' | 'error'

export interface FieldValidation {
  status: ValidationStatus
  message?: string
}

export type ValidationReport = {
  [K in keyof ExtractedModel]?: FieldValidation
} & {
  benchmarks_detail?: Record<string, FieldValidation>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse strings like "70B", "1.5T", "671B", "Undisclosed" → number in billions */
function parseParamsBillions(s: string | null): number | null {
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower.includes('undisclosed') || lower.includes('unknown') || lower === '?') return null
  const m = lower.match(/([\d,.]+)\s*(t|b|m)?/)
  if (!m) return null
  const num = parseFloat(m[1].replace(',', ''))
  const unit = m[2]
  if (unit === 't') return num * 1000
  if (unit === 'm') return num / 1000
  return num  // already in billions
}

/** Parse context window strings like "128K", "1M", "200K" → number in tokens */
function parseCtxTokens(s: string | null): number | null {
  if (!s) return null
  const m = s.toLowerCase().match(/([\d.]+)\s*(k|m)?/)
  if (!m) return null
  const num = parseFloat(m[1])
  const unit = m[2]
  if (unit === 'm') return num * 1_000_000
  if (unit === 'k') return num * 1_000
  return num
}

const TODAY = new Date()
const MIN_DATE = new Date('2017-01-01')

// ─── Per-field validators ─────────────────────────────────────────────────────

function validateDate(val: string | null): FieldValidation {
  if (!val) return { status: 'warning', message: '未找到发布日期' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return { status: 'error', message: `日期格式应为 YYYY-MM-DD，当前: "${val}"` }
  const d = new Date(val)
  if (isNaN(d.getTime())) return { status: 'error', message: '无效日期' }
  if (d < MIN_DATE) return { status: 'warning', message: `发布日期早于 2017 年，请核实` }
  if (d > TODAY) return { status: 'warning', message: `发布日期在未来 (${val})，可能是预计日期` }
  return { status: 'ok' }
}

/** Normalise a raw params string to the canonical {total}-A{active} form if possible.
 *  Returns the normalised string, or null if no normalisation was found.
 *  Examples of wrong formats the LLM may produce:
 *    "671B (37B active)"  → "671B-A37B"
 *    "671B / 37B active"  → "671B-A37B"
 *    "671B total, 37B activated" → "671B-A37B"
 */
function normaliseMoEParams(raw: string): string | null {
  // Already correct: "{X}-A{Y}"
  if (/^[\d.]+[BTKM]-A[\d.]+[BTKM.]+$/i.test(raw)) return null  // already canonical

  // Pattern: "671B (37B active)" or "671B (37B activated)"
  const m1 = raw.match(/^([\d.]+[BTKM])\s*\(\s*([\d.]+[BTKM.]+)\s*active/i)
  if (m1) return `${m1[1].toUpperCase()}-A${m1[2].toUpperCase()}`

  // Pattern: "671B / 37B" or "671B/37B"
  const m2 = raw.match(/^([\d.]+[BTKM])\s*\/\s*([\d.]+[BTKM.]+)/i)
  if (m2) return `${m2[1].toUpperCase()}-A${m2[2].toUpperCase()}`

  // Pattern: "671B total, 37B active" or "671B total 37B activated"
  const m3 = raw.match(/^([\d.]+[BTKM])\s*(?:total)[,\s]+\s*([\d.]+[BTKM.]+)/i)
  if (m3) return `${m3[1].toUpperCase()}-A${m3[2].toUpperCase()}`

  return null
}

function validateParams(val: string | null, modelName?: string | null): FieldValidation {
  if (!val) return { status: 'warning', message: '参数量未知' }

  const lower = val.toLowerCase()
  if (lower.includes('undisclosed') || lower.includes('unknown')) return { status: 'ok' }

  // ── Canonical cross-check ──────────────────────────────────────────────────
  const spec = MODEL_SPECS[(modelName ?? '').trim()]
  if (spec?.params && spec.params !== val) {
    return {
      status: 'error',
      message: `规格库已知值为 "${spec.params}"，当前值 "${val}" 将被自动修正`,
    }
  }

  // ── Format check for MoE models ────────────────────────────────────────────
  // Detect wrong separators: parens, slash, space+active, comma+active
  const hasWrongSeparator = /\([\d.]+[btkm]/i.test(val) ||
    /\/ *[\d.]+[btkm]/i.test(val) ||
    /total[,\s]/i.test(val)

  if (hasWrongSeparator) {
    const fixed = normaliseMoEParams(val)
    return {
      status: 'error',
      message: `MoE 参数格式错误，请使用 "总量-A激活量" 格式${fixed ? `，建议改为 "${fixed}"` : ''}`,
    }
  }

  // Detect bare numbers that look suspiciously like only active params for major MoE models
  // (e.g. "37" or "37B" without total, for a model expected to be 671B)
  const billions = parseParamsBillions(val)
  if (billions === null) return { status: 'warning', message: `无法解析参数量: "${val}"` }
  if (billions < 0.001) return { status: 'error', message: `参数量过小: ${val}` }
  if (billions > 3000) return { status: 'warning', message: `参数量异常大 (${val})，请核实` }

  return { status: 'ok' }
}

function validateContextWindow(val: string | null, modelName?: string | null): FieldValidation {
  if (!val) return { status: 'warning', message: '上下文窗口未知' }

  // ── Canonical cross-check ──────────────────────────────────────────────────
  const spec = MODEL_SPECS[(modelName ?? '').trim()]
  if (spec?.context_window && spec.context_window !== val) {
    return {
      status: 'error',
      message: `规格库已知值为 "${spec.context_window}"，当前值 "${val}" 将被自动修正`,
    }
  }

  const tokens = parseCtxTokens(val)
  if (tokens === null) return { status: 'warning', message: `无法解析上下文窗口: "${val}"` }
  if (tokens < 1_000) return { status: 'error', message: `上下文窗口过小: ${val}` }
  if (tokens > 10_000_000) return { status: 'warning', message: `上下文窗口异常大 (${val})，请核实` }
  return { status: 'ok' }
}

function validatePrice(val: number | null, label: string): FieldValidation {
  if (val === null || val === undefined) return { status: 'warning', message: `${label}未找到` }
  if (val < 0) return { status: 'error', message: `${label}不能为负数` }
  if (val === 0) return { status: 'ok' }  // free tier / open weight
  if (val > 500) return { status: 'warning', message: `${label}异常高 ($${val}/1M tokens)，请核实` }
  return { status: 'ok' }
}

function validatePricePair(input: number | null, output: number | null): FieldValidation | null {
  if (input === null || output === null) return null
  if (input > 0 && output > 0) {
    const ratio = output / input
    if (ratio > 30) return { status: 'warning', message: `输出/输入价格比 ${ratio.toFixed(1)}x 异常高，请核实` }
    if (ratio < 1) return { status: 'warning', message: `输出价格低于输入价格，请核实` }
  }
  return null
}

// Known benchmark score ranges
const BENCHMARK_RANGES: Record<string, { min: number; max: number; label: string }> = {
  'swe-bench':    { min: 0,   max: 100,  label: '% resolved' },
  'mmlu':         { min: 0,   max: 100,  label: '%' },
  'humaneval':    { min: 0,   max: 100,  label: 'pass@1 %' },
  'math':         { min: 0,   max: 100,  label: '%' },
  'gpqa diamond': { min: 0,   max: 100,  label: '%' },
  'arc-agi':      { min: 0,   max: 100,  label: '%' },
  'arena elo':    { min: 800, max: 2000, label: 'ELO' },
  'chatbot arena':{ min: 800, max: 2000, label: 'ELO' },
  'aime':         { min: 0,   max: 100,  label: '%' },
}

function validateBenchmarks(
  benchmarks: { name: string; score: number }[]
): { overall: FieldValidation; detail: Record<string, FieldValidation> } {
  if (!benchmarks?.length) {
    return { overall: { status: 'warning', message: '无 benchmark 数据' }, detail: {} }
  }

  const detail: Record<string, FieldValidation> = {}
  for (const b of benchmarks) {
    const key = b.name.toLowerCase()
    const range = BENCHMARK_RANGES[key]
    if (range) {
      if (b.score < range.min || b.score > range.max) {
        detail[b.name] = {
          status: 'error',
          message: `${b.name} 分数 ${b.score} 超出预期范围 [${range.min}, ${range.max}]`,
        }
      } else {
        detail[b.name] = { status: 'ok' }
      }
    } else {
      detail[b.name] = { status: 'ok' }
    }
  }

  const hasError = Object.values(detail).some(v => v.status === 'error')
  return {
    overall: hasError
      ? { status: 'error', message: '部分 benchmark 数值超出预期范围' }
      : { status: 'ok' },
    detail,
  }
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateExtracted(model: ExtractedModel): ValidationReport {
  const report: ValidationReport = {}

  report.release_date   = validateDate(model.release_date)
  report.params         = validateParams(model.params, model.name)
  report.context_window = validateContextWindow(model.context_window, model.name)
  report.input_price    = validatePrice(model.input_price, '输入价格')
  report.output_price   = validatePrice(model.output_price, '输出价格')

  const pricePairWarn = validatePricePair(model.input_price, model.output_price)
  if (pricePairWarn) report.output_price = pricePairWarn  // override with pair warning

  const benchResult = validateBenchmarks(model.benchmarks ?? [])
  report.benchmarks = benchResult.overall
  report.benchmarks_detail = benchResult.detail

  if (!model.architecture) report.architecture = { status: 'warning', message: '架构信息未找到' }

  // License: check presence, then canonical cross-check
  const specLicense = MODEL_SPECS[(model.name ?? '').trim()]?.license
  if (!model.license) {
    report.license = { status: 'warning', message: '许可证未找到' }
  } else if (specLicense && specLicense !== model.license) {
    report.license = {
      status: 'error',
      message: `规格库已知值为 "${specLicense}"，当前值 "${model.license}" 将被自动修正`,
    }
  }

  return report
}

/**
 * Summarize the validation report into counts.
 */
export function summarizeValidation(report: ValidationReport) {
  const vals = Object.values(report).filter(v => v && typeof v === 'object' && 'status' in v) as FieldValidation[]
  return {
    errors:   vals.filter(v => v.status === 'error').length,
    warnings: vals.filter(v => v.status === 'warning').length,
    ok:       vals.filter(v => v.status === 'ok').length,
  }
}
