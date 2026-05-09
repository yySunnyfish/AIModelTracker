'use client'

import { useState, useRef, useEffect } from 'react'
import type { ExtractedModel } from '@/lib/extractor'
import type { EvidenceMap } from '@/lib/multi_source_fetcher'
import type { ValidationReport } from '@/lib/field_validator'

interface ScrapeModalProps {
  onClose: () => void
  onSaved?: () => void
  existingModels?: { id: string; name: string; company: string }[]
}

type Step = 'input' | 'fetching' | 'preview' | 'saving' | 'done'

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   'text-green-600',
  medium: 'text-yellow-600',
  low:    'text-red-500',
}
const CONFIDENCE_ICON: Record<string, string> = {
  high: '✓', medium: '○', low: '⚠',
}
const EVIDENCE_BADGE: Record<string, { label: string; cls: string }> = {
  official:    { label: '官方',  cls: 'bg-green-100 text-green-800' },
  huggingface: { label: 'HF',    cls: 'bg-yellow-100 text-yellow-800' },
  arxiv:       { label: 'arXiv', cls: 'bg-blue-100 text-blue-800' },
  generated:   { label: '生成',  cls: 'bg-gray-100 text-gray-600' },
}
const VALIDATION_ROW_CLS: Record<string, string> = {
  error:   'bg-red-50/60',
  warning: 'bg-yellow-50/40',
  ok:      '',
}
const VALIDATION_ICON: Record<string, string> = {
  error: '✕', warning: '⚠', ok: '',
}
const VALIDATION_COLOR: Record<string, string> = {
  error: 'text-red-600', warning: 'text-yellow-600', ok: '',
}
const MODE_LABEL: Record<string, string> = {
  'multi-url':      '多源·URL',
  'multi-registry': '多源·注册表',
  'knowledge':      'LLM 知识',
  'url':            '单源·URL',
}
const FIELD_LABELS: Partial<Record<keyof ExtractedModel, string>> = {
  name:           '模型名称',
  company:        '公司',
  release_date:   '发布日期',
  params:         '参数量',
  context_window: '上下文窗口',
  license:        '许可证',
  modalities:     '模态',
  architecture:   '架构',
  innovation:     '创新点',
  input_price:    '输入价格 ($/1M)',
  output_price:   '输出价格 ($/1M)',
}

export function ScrapeModal({ onClose, onSaved, existingModels = [] }: ScrapeModalProps) {
  const [step, setStep] = useState<Step>('input')

  // Input
  const [modelName, setModelName]         = useState('')
  const [url, setUrl]                     = useState('')
  const [company, setCompany]             = useState('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [nameQuery, setNameQuery]         = useState('')
  const [showDropdown, setShowDropdown]   = useState(false)

  // Result
  const [extracted, setExtracted]         = useState<ExtractedModel | null>(null)
  const [diff, setDiff]                   = useState<Record<string, { old: any; new: any }> | null>(null)
  const [warnings, setWarnings]           = useState<string[]>([])
  const [editData, setEditData]           = useState<Partial<ExtractedModel>>({})
  const [fetchError, setFetchError]       = useState('')
  const [officialBenchmarks, setOfficialBenchmarks] = useState<Record<string, { score: number; sourceUrl: string }>>({})
  const [evidence, setEvidence]           = useState<EvidenceMap>({})
  const [fetchedUrls, setFetchedUrls]     = useState<string[]>([])
  const [failedUrls, setFailedUrls]       = useState<string[]>([])
  const [scrapeMode, setScrapeMode]       = useState<string>('')
  const [validation, setValidation]       = useState<ValidationReport>({})

  // Done
  const [savedId, setSavedId] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const filteredModels = existingModels.filter(m =>
    nameQuery.length > 0 &&
    (m.name.toLowerCase().includes(nameQuery.toLowerCase()) ||
      m.company.toLowerCase().includes(nameQuery.toLowerCase()))
  )

  function selectExistingModel(m: { id: string; name: string; company: string }) {
    setSelectedModelId(m.id)
    setModelName(m.name)
    setCompany(m.company)
    setNameQuery(m.name)
    setShowDropdown(false)
  }

  async function handleFetch() {
    if (!modelName.trim() && !url.trim()) return
    setStep('fetching')
    setFetchError('')
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim() || undefined,
          modelName: modelName.trim() || undefined,
          company: company.trim() || undefined,
          modelId: selectedModelId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Scrape failed')
      setExtracted(data.extracted)
      setEditData(data.extracted)
      setDiff(data.diff ?? null)
      setWarnings(data.warnings ?? [])
      setOfficialBenchmarks(data.officialBenchmarks ?? {})
      setEvidence(data.evidence ?? {})
      setFetchedUrls(data.fetchedUrls ?? [])
      setFailedUrls(data.failedUrls ?? [])
      setScrapeMode(data.mode ?? '')
      setValidation(data.validation ?? {})
      setStep('preview')
    } catch (e: any) {
      setFetchError(e.message)
      setStep('input')
    }
  }

  async function handleSave() {
    if (!extracted) return
    setStep('saving')
    const merged = { ...extracted, ...editData }
    try {
      if (selectedModelId) {
        const res = await fetch(`/api/models/${selectedModelId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: merged.name, params: merged.params, context_window: merged.context_window,
            license: merged.license, architecture: merged.architecture, innovation: merged.innovation,
            modalities: merged.modalities, source_url: merged.source_url,
            inputPrice: merged.input_price, outputPrice: merged.output_price,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setSavedId(selectedModelId)
      } else {
        const res = await fetch('/api/models/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        })
        const created = await res.json()
        if (!res.ok) throw new Error(created.error)
        setSavedId(created.id)
      }
      setStep('done')
      onSaved?.()
    } catch (e: any) {
      setFetchError(e.message)
      setStep('preview')
    }
  }

  function updateField(key: keyof ExtractedModel, value: any) {
    setEditData(prev => ({ ...prev, [key]: value }))
  }

  const merged = extracted ? { ...extracted, ...editData } : null

  // Summarise validation for footer
  const validationErrors   = Object.values(validation).filter(v => v && typeof v === 'object' && 'status' in v && (v as any).status === 'error').length
  const validationWarnings = Object.values(validation).filter(v => v && typeof v === 'object' && 'status' in v && (v as any).status === 'warning').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative flex w-[580px] max-h-[88vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div>
            <div className="text-sm font-semibold text-[var(--t1)]">
              {step === 'done' ? '✓ 保存成功' : selectedModelId ? '更新模型数据' : '添加新模型'}
            </div>
            <div className="text-[10px] text-[var(--t3)]">
              {step === 'input'   && '输入模型名称或粘贴页面链接'}
              {step === 'fetching'&& '正在多源并行抓取…'}
              {step === 'preview' && (fetchedUrls.length > 0 ? '检查数据、核实高亮字段后保存' : '抓取失败，请手动填写字段后保存')}
              {step === 'saving'  && '正在保存…'}
              {step === 'done'    && '模型数据已写入数据库'}
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--t3)] hover:text-[var(--t1)]">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* ── INPUT ─────────────────────────────────────────────────────── */}
          {step === 'input' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--t2)]">
                  模型名称 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={nameRef}
                    value={nameQuery}
                    onChange={e => { setNameQuery(e.target.value); setModelName(e.target.value); setSelectedModelId(''); setShowDropdown(true) }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="e.g. Claude 4 Opus, Gemini 2.5 Pro…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-primary"
                  />
                  {selectedModelId && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      更新模式
                    </span>
                  )}
                  {showDropdown && filteredModels.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-lg">
                      <div className="px-3 py-1.5 text-[10px] text-[var(--t3)]">已有模型 — 选择后进入更新模式</div>
                      {filteredModels.slice(0, 6).map(m => (
                        <button key={m.id} onMouseDown={() => selectExistingModel(m)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg2)]">
                          <span className="text-xs font-medium text-[var(--t1)]">{m.name}</span>
                          <span className="text-[10px] text-[var(--t3)]">{m.company}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--t2)]">公司（可选，提升准确率）</label>
                <input value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="e.g. Anthropic, Google, Meta…"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-primary" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--t2)]">页面链接（可选，优先使用）</label>
                <input value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://anthropic.com/claude-4  或  huggingface.co/…"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2 text-xs font-mono text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-primary" />
                <div className="mt-1 text-[10px] text-[var(--t3)]">
                  支持：官方博客 · HuggingFace · arXiv · Artificial Analysis
                </div>
              </div>
              {fetchError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">✕ {fetchError}</div>
              )}
            </div>
          )}

          {/* ── FETCHING ──────────────────────────────────────────────────── */}
          {step === 'fetching' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-primary" />
              <div className="text-xs text-[var(--t2)]">正在并行抓取多个权威来源…</div>
              <div className="text-[10px] text-[var(--t3)]">官方博客 · 定价页 · HuggingFace · 文档</div>
            </div>
          )}

          {/* ── PREVIEW ───────────────────────────────────────────────────── */}
          {step === 'preview' && merged && (
            <div className="space-y-3">

              {/* ① Mode + sources bar */}
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2 text-[10px]">
                {scrapeMode && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                    {MODE_LABEL[scrapeMode] ?? scrapeMode}
                  </span>
                )}
                {fetchedUrls.length > 0
                  ? <span className="text-[var(--t3)]">{fetchedUrls.length} 个来源已抓取{failedUrls.length > 0 && ` · ${failedUrls.length} 个失败`}</span>
                  : failedUrls.length > 0
                    ? <span className="text-orange-600 font-medium">URL 抓取失败，退回 LLM 知识模式</span>
                    : <span className="text-[var(--t3)]">基于 LLM 训练知识</span>
                }
                <div className="ml-auto flex gap-1">
                  {fetchedUrls.slice(0, 3).map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                      title={u}
                      className="max-w-[110px] truncate rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[9px] text-[var(--t3)] hover:text-[var(--t1)]">
                      {new URL(u).hostname.replace('www.', '')}
                    </a>
                  ))}
                  {fetchedUrls.length === 0 && failedUrls.slice(0, 2).map((u, i) => (
                    <span key={i} title={`抓取失败: ${u}`}
                      className="max-w-[110px] truncate rounded border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[9px] text-orange-700 line-through">
                      {new URL(u).hostname.replace('www.', '')}
                    </span>
                  ))}
                </div>
              </div>

              {/* ② Validation summary */}
              {(validationErrors > 0 || validationWarnings > 0) && (
                <div className={`rounded-lg border px-3 py-2 text-[11px] ${validationErrors > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-yellow-200 bg-yellow-50 text-yellow-800'}`}>
                  {validationErrors > 0 && <span className="font-semibold">✕ {validationErrors} 个字段有错误需修复 </span>}
                  {validationWarnings > 0 && <span>⚠ {validationWarnings} 个字段需核实</span>}
                  <span className="ml-1 text-[10px] opacity-70">— 红/黄行高亮显示</span>
                </div>
              )}

              {/* ③ Diff banner */}
              {diff && Object.keys(diff).length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                  检测到 {Object.keys(diff).length} 个字段变更（标注为 →）
                </div>
              )}

              {/* ④ Manual entry prompt — shown when all fetches failed and most fields are empty */}
              {fetchedUrls.length === 0 && failedUrls.length > 0 && !merged.params && !merged.context_window && !merged.input_price && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] text-blue-800">
                  <div className="font-semibold mb-0.5">✎ 手动填写模式</div>
                  <div className="text-blue-700 leading-relaxed">
                    URL 无法自动抓取（网站已启用 bot 防护）。下方字段均可直接编辑——填写完成后点击「确认添加」即可保存。
                  </div>
                </div>
              )}

              {/* ④b General warnings */}
              {warnings.filter(w => !w.startsWith('低置信度') && !w.startsWith('未找到')).length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-[11px] text-yellow-800 space-y-0.5">
                  {warnings.filter(w => !w.startsWith('低置信度') && !w.startsWith('未找到')).map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              {/* ⑤ Fields table */}
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full text-[11px]">
                  <tbody>
                    {(Object.keys(FIELD_LABELS) as (keyof ExtractedModel)[]).map((key, i) => {
                      const conf    = merged.confidence?.[key as string] ?? 'medium'
                      const hasChange = diff?.[key as string]
                      const val     = merged[key]
                      const displayVal = Array.isArray(val) ? val.join(', ') : String(val ?? '—')
                      const ev      = evidence[key as keyof typeof evidence]
                      const badge   = ev ? EVIDENCE_BADGE[ev.evidenceLevel] : null
                      const vd      = validation[key as keyof ValidationReport] as { status: string; message?: string } | undefined
                      const vstatus = vd?.status ?? 'ok'
                      const rowCls  = vstatus !== 'ok' ? VALIDATION_ROW_CLS[vstatus] : (i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg2)]')

                      return (
                        <tr key={key} className={`border-b border-[var(--border)] last:border-0 ${rowCls}`}>
                          <td className="w-[130px] px-3 py-2">
                            <div className="text-[var(--t3)]">{FIELD_LABELS[key]}</div>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {badge && (
                                <span className={`rounded px-1 py-0 text-[9px] font-medium ${badge.cls}`} title={ev?.sourceUrl}>
                                  {badge.label}
                                </span>
                              )}
                              {vstatus !== 'ok' && (
                                <span className={`text-[9px] font-medium ${VALIDATION_COLOR[vstatus]}`} title={vd?.message}>
                                  {VALIDATION_ICON[vstatus]} {vd?.message?.slice(0, 30)}{(vd?.message?.length ?? 0) > 30 ? '…' : ''}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {key === 'innovation' || key === 'architecture' ? (
                              <textarea rows={2}
                                value={typeof editData[key] === 'string' ? editData[key] as string : (val as string ?? '')}
                                onChange={e => updateField(key, e.target.value)}
                                className={`w-full resize-none rounded border bg-transparent px-2 py-1 text-[11px] text-[var(--t1)] outline-none focus:border-primary ${vstatus === 'error' ? 'border-red-300' : vstatus === 'warning' ? 'border-yellow-300' : 'border-[var(--border)]'}`}
                              />
                            ) : key === 'license' ? (
                              <select value={(editData.license ?? merged.license) ?? ''}
                                onChange={e => updateField('license', e.target.value)}
                                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[11px] text-[var(--t1)]">
                                <option value="">—</option>
                                <option value="open">open</option>
                                <option value="closed">closed</option>
                                <option value="partial">partial</option>
                              </select>
                            ) : (
                              <input
                                value={
                                  typeof editData[key] !== 'undefined'
                                    ? (Array.isArray(editData[key]) ? (editData[key] as string[]).join(', ') : String(editData[key] ?? ''))
                                    : displayVal === '—' ? '' : displayVal
                                }
                                onChange={e => {
                                  const v = e.target.value
                                  updateField(key, key === 'modalities' ? v.split(',').map(s => s.trim()) : key === 'input_price' || key === 'output_price' ? Number(v) || null : v)
                                }}
                                placeholder="—"
                                className={`w-full rounded border bg-transparent px-2 py-0.5 text-[11px] text-[var(--t1)] outline-none focus:border-primary ${vstatus === 'error' ? 'border-red-300' : vstatus === 'warning' ? 'border-yellow-300' : 'border-[var(--border)]'}`}
                              />
                            )}
                          </td>
                          <td className="w-14 px-2 py-2 text-right">
                            {hasChange ? (
                              <span className="text-[10px] text-blue-600 font-medium">→ 变更</span>
                            ) : (
                              <span className={`text-[10px] ${CONFIDENCE_COLOR[conf]}`}>
                                {CONFIDENCE_ICON[conf]}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ⑥ Benchmarks */}
              {merged.benchmarks?.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-[var(--t2)]">Benchmarks</div>
                  <div className="flex flex-wrap gap-1.5">
                    {merged.benchmarks.map((b, i) => {
                      const isOfficial = Object.keys(officialBenchmarks).some(
                        k => b.name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(b.name.toLowerCase().split(' ')[0])
                      )
                      const benchVd = validation.benchmarks_detail?.[b.name] as { status: string; message?: string } | undefined
                      const bErr    = benchVd?.status === 'error'
                      return (
                        <span key={i} title={benchVd?.message}
                          className={`rounded border px-2 py-1 text-[10px] font-mono ${bErr ? 'border-red-300 bg-red-50 text-red-800' : isOfficial ? 'border-green-300 bg-green-50 text-green-900' : 'border-[var(--border)] bg-[var(--bg2)] text-[var(--t1)]'}`}>
                          {b.name}: <strong>{b.score}</strong>
                          {isOfficial && <span className="ml-1 text-[9px] font-sans font-semibold text-green-700">✓官方</span>}
                          {bErr && <span className="ml-1 text-[9px] font-sans text-red-600">✕范围异常</span>}
                        </span>
                      )
                    })}
                  </div>
                  {Object.keys(officialBenchmarks).length > 0 && (
                    <div className="mt-1 text-[10px] text-green-700">
                      ✓ {Object.keys(officialBenchmarks).length} 项已从官方榜单核验
                    </div>
                  )}
                </div>
              )}

              {/* ⑦ Source URL */}
              {merged.source_url && (
                <div className="text-[10px] text-[var(--t3)]">
                  主来源: <a href={merged.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--t1)]">{merged.source_url}</a>
                </div>
              )}

              {fetchError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">✕ {fetchError}</div>
              )}
            </div>
          )}

          {/* ── SAVING ────────────────────────────────────────────────────── */}
          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-primary" />
              <div className="text-xs text-[var(--t2)]">正在写入数据库…</div>
            </div>
          )}

          {/* ── DONE ──────────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">✓</div>
              <div className="text-sm font-semibold text-[var(--t1)]">
                {selectedModelId ? '模型数据已更新' : '新模型已添加'}
              </div>
              <div className="text-[11px] text-[var(--t3)]">
                {Object.keys(diff ?? {}).length > 0 ? `${Object.keys(diff!).length} 个字段已更新` : '数据已写入'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3">
          <div className="text-[10px] text-[var(--t3)]">
            {step === 'preview' && validationErrors > 0 && (
              <span className="text-red-600 font-medium">请修复 {validationErrors} 个错误后再保存</span>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'input' && (
              <>
                <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]">取消</button>
                <button onClick={handleFetch} disabled={!modelName.trim() && !url.trim()}
                  className="rounded-lg bg-primary px-4 py-1.5 text-[11px] font-medium text-white disabled:opacity-40 hover:bg-primary/90">
                  抓取 →
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button onClick={() => setStep('input')} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]">← 返回</button>
                <button onClick={handleSave}
                  className={`rounded-lg px-4 py-1.5 text-[11px] font-medium text-white ${validationErrors > 0 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-primary hover:bg-primary/90'}`}>
                  {validationErrors > 0 ? '⚠ 仍有错误，强制保存' : selectedModelId ? '确认更新' : '确认添加'}
                </button>
              </>
            )}
            {step === 'done' && (
              <button onClick={onClose} className="rounded-lg bg-primary px-4 py-1.5 text-[11px] font-medium text-white hover:bg-primary/90">关闭</button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
