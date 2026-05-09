'use client'

import { useState } from 'react'
import type { DiscoveredModel } from '@/app/api/admin/discover-new-models/route'
import type { IngestResult } from '@/app/api/admin/batch-ingest/route'
import type { ModelCategory } from '@/lib/company_discovery'

interface DiscoverModalProps {
  onClose:  () => void
  onSaved:  () => void
}

type Phase = 'config' | 'discovering' | 'review' | 'ingesting' | 'done'

type CategoryOption = 'llm' | 'embodied' | 'both'

const CATEGORY_LABELS: Record<CategoryOption, string> = {
  llm:      'LLM / 多模态',
  embodied: 'Embodied AI / 世界模型',
  both:     '两者都抓',
}

const CATEGORY_DESC: Record<CategoryOption, string> = {
  llm:      'OpenAI · Anthropic · Google · Meta · DeepSeek · Qwen · xAI · Mistral…',
  embodied: 'Physical Intelligence · Figure · 1X · Unitree · Wayve · NVIDIA Isaac · Sora…',
  both:     '以上所有公司',
}

export function DiscoverModal({ onClose, onSaved }: DiscoverModalProps) {
  const [phase,      setPhase]      = useState<Phase>('config')
  const [since,      setSince]      = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 2)
    return d.toISOString().slice(0, 10)
  })
  const [until,      setUntil]      = useState(() => new Date().toISOString().slice(0, 10))
  const [category,   setCategory]   = useState<CategoryOption>('llm')
  const [keywords,   setKeywords]   = useState('')
  const [candidates, setCandidates] = useState<DiscoveredModel[]>([])
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [results,    setResults]    = useState<IngestResult[]>([])
  const [snippets,   setSnippets]   = useState<Record<string, string>>({})
  const [error,      setError]      = useState<string | null>(null)
  const [dryRun,     setDryRun]     = useState(false)
  const [ingestProgress, setIngestProgress] = useState(0)

  // ── Step 1: Discover ───────────────────────────────────────────────────────

  async function handleDiscover() {
    setPhase('discovering')
    setError(null)
    try {
      const params = new URLSearchParams({ since, until, category })
      if (keywords.trim()) params.set('keywords', keywords.trim())

      const res = await fetch(`/api/admin/discover-new-models?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const candidates: DiscoveredModel[] = data.candidates ?? []
      setCandidates(candidates)
      setSelected(new Set(
        candidates.filter(c => !c.alreadyInDb).map(c => `${c.company}::${c.name}`),
      ))
      setPhase('review')
    } catch (err: any) {
      setError(err.message)
      setPhase('config')
    }
  }

  // ── Step 2: Ingest (SSE streaming) ────────────────────────────────────────

  async function handleIngest() {
    const toIngest = candidates.filter(c =>
      selected.has(`${c.company}::${c.name}`) && !c.alreadyInDb,
    )
    if (toIngest.length === 0) return

    setPhase('ingesting')
    setResults([])
    setIngestProgress(0)
    setError(null)

    const allResults: IngestResult[] = []

    try {
      const res = await fetch('/api/admin/batch-ingest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ candidates: toIngest, dryRun }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress') {
              allResults.push(event.result)
              setResults(prev => [...prev, event.result])
              setIngestProgress(prev => prev + 1)
            } else if (event.type === 'done') {
              setSnippets(event.codeSnippets ?? {})
            }
          } catch { /* malformed line — skip */ }
        }
      }

      // All data written to DB during ingest — just update UI
      setPhase('done')
      if (!dryRun) {
        onSaved()
      }

    } catch (err: any) {
      setError(err.message)
      setPhase('review')
    }
  }

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const newCandidates = candidates.filter(c => !c.alreadyInDb)
  const existingCount = candidates.filter(c =>  c.alreadyInDb).length
  const selCount      = candidates.filter(c => selected.has(`${c.company}::${c.name}`) && !c.alreadyInDb).length

  const categoryBadge = (cat: ModelCategory | undefined) =>
    cat === 'embodied'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-violet-50 text-violet-700'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-[700px] max-h-[88vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-[var(--t1)]">发现新模型</div>
            <div className="text-[10px] text-[var(--t3)]">
              {phase === 'config'      && '选择时间范围、模型类别，从 Epoch AI + HuggingFace 自动发现'}
              {phase === 'discovering' && '正在查询 Epoch AI + HuggingFace…'}
              {phase === 'review'      && `发现 ${candidates.length} 个模型 · ${newCandidates.length} 个未入库 · ${existingCount} 已存在`}
              {phase === 'ingesting'   && `正在处理 ${ingestProgress} / ${selCount} 个模型…`}
              {phase === 'done'        && `完成：${results.filter(r=>r.status==='created').length} 已入库，${results.filter(r=>r.status==='dry_run').length} 预览，${results.filter(r=>r.status==='failed').length} 失败`}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--t3)] hover:bg-[var(--bg2)] hover:text-[var(--t1)]">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Phase: config ── */}
          {phase === 'config' && (
            <div className="space-y-4">

              {/* Date range */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-medium text-[var(--t3)]">开始日期</label>
                  <input type="date" value={since} onChange={e => setSince(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2 text-[12px] text-[var(--t1)]" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-medium text-[var(--t3)]">结束日期</label>
                  <input type="date" value={until} onChange={e => setUntil(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2 text-[12px] text-[var(--t1)]" />
                </div>
              </div>

              {/* Category selector */}
              <div>
                <label className="mb-1.5 block text-[10px] font-medium text-[var(--t3)]">抓取类别</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['llm', 'embodied', 'both'] as CategoryOption[]).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setCategory(opt)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        category === opt
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-[var(--border)] bg-[var(--bg2)] text-[var(--t2)] hover:border-blue-200'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{CATEGORY_LABELS[opt]}</div>
                      <div className="mt-0.5 text-[9px] leading-relaxed opacity-70">{CATEGORY_DESC[opt]}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Keywords filter */}
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--t3)]">
                  关键词筛选 <span className="font-normal opacity-60">（可选，逗号分隔；模型名或公司名含任意关键词即保留）</span>
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="例：Qwen, Llama, 72B, VL"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2 text-[12px] text-[var(--t1)] placeholder:text-[var(--t3)]"
                />
              </div>

              {/* Source info */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-4 py-3 text-[11px] text-[var(--t2)] leading-relaxed">
                <div className="mb-1 font-semibold text-[var(--t1)]">数据来源</div>
                <div>• <span className="font-medium">Epoch AI CSV</span> — ~1 000 个里程碑模型，含发布日期、参数量、官方 URL</div>
                <div>• <span className="font-medium">HuggingFace API</span> — 公开权重模型，按 lastModified 过滤</div>
              </div>

              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
            </div>
          )}

          {/* ── Phase: discovering ── */}
          {phase === 'discovering' && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-[12px] text-[var(--t2)]">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--t2)]" />
                查询 Epoch AI CSV 和 HuggingFace API…
              </div>
            </div>
          )}

          {/* ── Phase: review ── */}
          {phase === 'review' && (
            <div className="space-y-3">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}

              {newCandidates.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">
                      未入库 ({newCandidates.length})
                    </span>
                    <button onClick={() => setSelected(new Set(newCandidates.map(c => `${c.company}::${c.name}`)))}
                      className="text-[10px] text-blue-600 hover:underline">全选</button>
                    <button onClick={() => setSelected(new Set())}
                      className="text-[10px] text-[var(--t3)] hover:underline">清空</button>
                  </div>
                  <div className="space-y-1.5">
                    {newCandidates.map(c => {
                      const key = `${c.company}::${c.name}`
                      const checked = selected.has(key)
                      return (
                        <label key={key}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                            checked ? 'border-blue-200 bg-blue-50' : 'border-[var(--border)] bg-[var(--bg2)]'
                          }`}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleSelect(key)}
                            className="h-3.5 w-3.5 accent-blue-600" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-[var(--t1)] truncate">{c.name}</span>
                              <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg)] px-1.5 py-px text-[9px] text-[var(--t3)]">{c.company}</span>
                              <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium ${
                                c.source === 'epoch'       ? 'bg-violet-50 text-violet-700' :
                                c.source === 'huggingface' ? 'bg-amber-50 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>{c.source}</span>
                              {c.category && (
                                <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium ${categoryBadge(c.category)}`}>
                                  {c.category === 'embodied' ? 'embodied' : 'llm'}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex gap-3 text-[9px] text-[var(--t3)]">
                              {c.releaseDate && <span>{c.releaseDate}</span>}
                              {c.params      && <span>{c.params}</span>}
                              {c.openWeights != null && <span>{c.openWeights ? 'Open' : 'Closed'}</span>}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {existingCount > 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2">
                  <div className="text-[10px] text-[var(--t3)]">✓ 已入库 {existingCount} 个模型（跳过）</div>
                </div>
              )}

              {newCandidates.length === 0 && (
                <div className="py-8 text-center text-[12px] text-[var(--t3)]">
                  该时间段内所有发现的模型均已入库
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}
                  className="h-3.5 w-3.5 accent-blue-600" />
                <span className="text-[11px] text-[var(--t2)]">预览模式（仅运行抓取，不写入数据库）</span>
              </label>
            </div>
          )}

          {/* ── Phase: ingesting (streaming) ── */}
          {phase === 'ingesting' && (
            <div className="space-y-3">
              {/* Progress bar */}
              <div>
                <div className="mb-1.5 flex justify-between text-[10px] text-[var(--t3)]">
                  <span>正在抓取并入库，请稍候…（每个模型约 10–25 秒）</span>
                  <span>{ingestProgress} / {selCount}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg2)]">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${selCount > 0 ? (ingestProgress / selCount) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Live results as they stream in */}
              {results.length > 0 && (
                <div className="space-y-1.5">
                  {results.map((r, i) => (
                    <div key={i} className={`rounded-lg border px-3 py-2 text-[11px] ${
                      r.status === 'created'  ? 'border-green-200 bg-green-50' :
                      r.status === 'dry_run'  ? 'border-blue-200 bg-blue-50' :
                      r.status === 'failed'   ? 'border-red-200 bg-red-50' :
                      'border-[var(--border)] bg-[var(--bg2)]'
                    }`}>
                      <span className="mr-2 text-[10px]">
                        {r.status === 'created' ? '✓' : r.status === 'dry_run' ? '◎' : '✗'}
                      </span>
                      <span className="font-semibold text-[var(--t1)]">{r.name}</span>
                      <span className="ml-2 text-[10px] text-[var(--t3)]">{r.company}</span>
                      {r.status === 'failed' && (
                        <span className="ml-2 text-[10px] text-red-600">{r.error}</span>
                      )}
                    </div>
                  ))}
                  {/* Pending spinner */}
                  <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--t3)]">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--t2)]" />
                    处理中…
                  </div>
                </div>
              )}

              {results.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3 text-[12px] text-[var(--t2)]">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--t2)]" />
                    正在处理第一个模型…
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Phase: done ── */}
          {phase === 'done' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 ${
                    r.status === 'created'  ? 'border-green-200 bg-green-50' :
                    r.status === 'dry_run'  ? 'border-blue-200 bg-blue-50' :
                    r.status === 'failed'   ? 'border-red-200 bg-red-50' :
                    'border-[var(--border)] bg-[var(--bg2)]'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]">
                        {r.status === 'created' ? '✓' : r.status === 'dry_run' ? '◎' : '✗'}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--t1)]">{r.name}</span>
                      <span className="text-[10px] text-[var(--t3)]">{r.company}</span>
                      {r.status === 'failed' && (
                        <span className="ml-auto text-[10px] text-red-600">{r.error}</span>
                      )}
                    </div>
                    {r.extracted && (
                      <div className="mt-0.5 flex flex-wrap gap-3 text-[9px] text-[var(--t3)]">
                        {r.extracted.release_date   && <span>{r.extracted.release_date}</span>}
                        {r.extracted.params         && <span>{r.extracted.params}</span>}
                        {r.extracted.context_window && <span>ctx {r.extracted.context_window}</span>}
                        {r.extracted.input_price    != null && <span>${r.extracted.input_price}/${r.extracted.output_price}/M</span>}
                        {r.extracted.license        && <span>{r.extracted.license}</span>}
                        {r.extracted.benchmarks && r.extracted.benchmarks.length > 0 && (
                          <span>{r.extracted.benchmarks.slice(0, 3).map(b => `${b.name}:${b.score}`).join(' · ')}</span>
                        )}
                      </div>
                    )}
                    {r.dimScores && Object.keys(r.dimScores).length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-2 text-[9px] text-blue-600">
                        {Object.entries(r.dimScores).map(([k, v]) =>
                          v != null ? <span key={k}>{k[0].toUpperCase()}:{v}</span> : null
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Code snippets (collapsible, for manual source_registry update) */}
              {Object.keys(snippets).length > 0 && (
                <details className="rounded-lg border border-[var(--border)]">
                  <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">
                    静态文件代码片段（备用）
                  </summary>
                  <div className="space-y-2 p-3 pt-0">
                    {Object.entries(snippets).map(([file, code]) => (
                      <div key={file} className="rounded-lg border border-[var(--border)] bg-[var(--bg2)]">
                        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
                          <span className="font-mono text-[10px] text-[var(--t2)]">{file}.ts</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(code)}
                            className="text-[9px] text-blue-600 hover:underline">复制</button>
                        </div>
                        <pre className="overflow-x-auto px-3 py-2 text-[10px] text-[var(--t1)]">{code}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]">
            {phase === 'done' ? '关闭' : '取消'}
          </button>

          <div className="flex gap-2">
            {phase === 'config' && (
              <button onClick={handleDiscover}
                className="rounded-lg bg-[var(--t1)] px-5 py-2 text-[11px] font-medium text-white hover:opacity-90">
                开始发现
              </button>
            )}
            {phase === 'review' && selCount > 0 && (
              <button onClick={handleIngest}
                className="rounded-lg bg-[var(--t1)] px-5 py-2 text-[11px] font-medium text-white hover:opacity-90">
                {dryRun ? `预览 ${selCount} 个` : `导入 ${selCount} 个`}
              </button>
            )}
            {phase === 'done' && !dryRun && (
              <>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-green-600 px-5 py-2 text-[11px] font-medium text-white hover:bg-green-700">
                  刷新页面
                </button>
                <button onClick={() => { setPhase('config'); setCandidates([]); setResults([]) }}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]">
                  再次发现
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
