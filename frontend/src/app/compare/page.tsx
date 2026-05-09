'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

const ALL_BENCHMARKS = ['SWE-bench', 'MMLU']

type Model = {
  id: string
  name: string
  company: string
  region: string
  color: string
  category: string
  license: string
  params: string
  contextWindow: string
  modalities: string[]
  innovation: string
  architecture: string
  releaseDate: string
  benchmarks: Record<string, number>
  inputPrice: number
  outputPrice: number
}

type Annotation = {
  id: string
  model_id: string
  content: string
  author_name: string
  visibility: string
  is_pinned: boolean
  created_at: string
}

export default function ComparePage() {
  const { data: session } = useSession()
  const canEdit = !!session?.user
  const [allModels, setAllModels] = useState<{ id: string; name: string; company: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [compared, setCompared] = useState<Model[]>([])
  const [loading, setLoading] = useState(false)

  // Annotation state
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({})
  const [activeAnnotModel, setActiveAnnotModel] = useState<string | null>(null)
  const [newContent, setNewContent] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [annotLoading, setAnnotLoading] = useState(false)

  // Refresh/edit state
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, any>>({})
  const [saveLoading, setSaveLoading] = useState(false)

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAllModels(data) })
      .catch(() => {})
  }, [])

  const loadCompare = useCallback(() => {
    if (selectedIds.length < 2) { setCompared([]); return }
    setLoading(true)
    fetch(`/api/compare?ids=${selectedIds.join(',')}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCompared(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedIds])

  useEffect(() => { loadCompare() }, [loadCompare])

  const loadAnnotations = (modelId: string) => {
    fetch(`/api/annotations?model_id=${modelId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAnnotations(prev => ({ ...prev, [modelId]: data }))
      })
  }

  const toggleAnnotPanel = (modelId: string) => {
    if (activeAnnotModel === modelId) {
      setActiveAnnotModel(null)
    } else {
      setActiveAnnotModel(modelId)
      loadAnnotations(modelId)
    }
  }

  const submitAnnotation = async (modelId: string) => {
    if (!canEdit) return
    if (!newContent.trim()) return
    setAnnotLoading(true)
    await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, content: newContent, author_name: newAuthor || 'Anonymous' }),
    })
    setNewContent('')
    loadAnnotations(modelId)
    setAnnotLoading(false)
  }

  const deleteAnnotation = async (annotId: string, modelId: string) => {
    if (!canEdit) return
    await fetch(`/api/annotations/${annotId}`, { method: 'DELETE' })
    loadAnnotations(modelId)
  }

  const startEdit = (model: Model) => {
    if (!canEdit) return
    setEditingModel(model.id)
    setEditFields({
      params: model.params,
      context_window: model.contextWindow,
      innovation: model.innovation,
      architecture: model.architecture,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
    })
  }

  const saveEdit = async (modelId: string) => {
    if (!canEdit) return
    setSaveLoading(true)
    await fetch(`/api/models/${modelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editFields),
    })
    setEditingModel(null)
    setSaveLoading(false)
    loadCompare()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    )
  }

  // Best value highlighting per row
  const bestPrice = compared.length ? Math.min(...compared.map(m => m.inputPrice).filter(p => p > 0)) : 0
  const bestSwe = compared.length ? Math.max(...compared.map(m => m.benchmarks['SWE-bench'] ?? 0)) : 0
  const bestMmlu = compared.length ? Math.max(...compared.map(m => m.benchmarks['MMLU'] ?? 0)) : 0

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
        <Link href="/" className="text-xs text-[var(--t3)] hover:text-[var(--t1)]">← Back</Link>
        <h1 className="text-sm font-semibold text-[var(--t1)]">Model Compare</h1>
        <span className="text-xs text-[var(--t3)]">Select 2–4 models for side-by-side comparison</span>
      </div>

      {/* Model selector */}
      <div className="border-b border-[var(--border)] bg-[var(--bg2)] px-5 py-3">
        <div className="flex flex-wrap gap-1.5">
          {allModels.map(m => {
            const sel = selectedIds.includes(m.id)
            const idx = selectedIds.indexOf(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggleSelect(m.id)}
                disabled={!sel && selectedIds.length >= 4}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  sel
                    ? 'border-blue-400 bg-blue-50 text-blue-800'
                    : selectedIds.length >= 4
                    ? 'border-[var(--border)] text-[var(--t3)] opacity-40 cursor-not-allowed'
                    : 'border-[var(--border)] text-[var(--t2)] hover:border-blue-300'
                }`}
              >
                {sel && <span className="mr-1 font-bold">{idx + 1}</span>}
                {m.name}
                <span className="ml-1 text-[10px] opacity-60">{m.company}</span>
              </button>
            )
          })}
        </div>
        {selectedIds.length < 2 && (
          <p className="mt-2 text-xs text-[var(--t3)]">Select at least 2 models to compare</p>
        )}
      </div>

      {/* Comparison table */}
      {loading && <div className="py-8 text-center text-xs text-[var(--t3)]">Loading...</div>}

      {compared.length >= 2 && !loading && (
        <div className="overflow-x-auto p-5">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-32 border-b border-[var(--border)] py-2 text-left text-[var(--t3)] font-normal" />
                {compared.map(m => (
                  <th key={m.id} className="border-b border-[var(--border)] px-3 py-2 text-left min-w-[180px]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                      <span className="font-semibold text-[var(--t1)]">{m.name}</span>
                    </div>
                    <div className="text-[10px] text-[var(--t3)]">{m.company} · {m.region}</div>
                    <div className="mt-1.5 flex gap-1">
                      <button
                        onClick={() => toggleAnnotPanel(m.id)}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                          activeAnnotModel === m.id
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-[var(--border)] text-[var(--t3)] hover:border-amber-300'
                        }`}
                      >
                        💬 {(annotations[m.id] ?? []).length}
                      </button>
                      <button
                        onClick={() => editingModel === m.id ? setEditingModel(null) : startEdit(m)}
                        disabled={!canEdit}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                          editingModel === m.id
                            ? 'border-blue-300 bg-blue-50 text-blue-800'
                            : canEdit
                            ? 'border-[var(--border)] text-[var(--t3)] hover:border-blue-300'
                            : 'border-[var(--border)] text-[var(--t3)] opacity-40 cursor-not-allowed'
                        }`}
                      >
                        ✏️ Edit
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Basic info rows */}
              {[
                { label: 'Release', key: (m: Model) => m.releaseDate },
                { label: 'Category', key: (m: Model) => m.category },
                { label: 'License', key: (m: Model) => m.license },
                { label: 'Params', key: (m: Model) => m.params || '—' },
                { label: 'Context', key: (m: Model) => m.contextWindow || '—' },
                { label: 'Modalities', key: (m: Model) => (m.modalities ?? []).join(', ') || '—' },
              ].map(row => (
                <tr key={row.label} className="border-b border-[var(--border)] hover:bg-[var(--bg2)]">
                  <td className="py-2 pr-3 text-[var(--t3)]">{row.label}</td>
                  {compared.map(m => (
                    <td key={m.id} className="px-3 py-2 font-mono text-[var(--t1)]">{row.key(m)}</td>
                  ))}
                </tr>
              ))}

              {/* Price row */}
              <tr className="border-b border-[var(--border)] hover:bg-[var(--bg2)]">
                <td className="py-2 pr-3 text-[var(--t3)]">Price in/out</td>
                {compared.map(m => (
                  <td key={m.id} className={`px-3 py-2 font-mono font-semibold ${
                    m.inputPrice === 0 ? 'text-green-700' :
                    m.inputPrice === bestPrice ? 'text-green-700' : 'text-amber-700'
                  }`}>
                    {editingModel === m.id ? (
                      <div className="flex gap-1">
                        <input type="number" step="0.01" value={editFields.inputPrice}
                          onChange={e => setEditFields(p => ({ ...p, inputPrice: parseFloat(e.target.value) }))}
                          className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-1 text-xs" />
                        <span>/</span>
                        <input type="number" step="0.01" value={editFields.outputPrice}
                          onChange={e => setEditFields(p => ({ ...p, outputPrice: parseFloat(e.target.value) }))}
                          className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-1 text-xs" />
                      </div>
                    ) : (
                      m.inputPrice === 0 ? 'Free' : `$${m.inputPrice} / $${m.outputPrice}`
                    )}
                    {m.inputPrice > 0 && m.inputPrice === bestPrice && (
                      <span className="ml-1 rounded bg-green-100 px-1 text-[9px] text-green-700">cheapest</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Benchmark rows */}
              {ALL_BENCHMARKS.map(bm => {
                const best = bm === 'SWE-bench' ? bestSwe : bestMmlu
                return (
                  <tr key={bm} className="border-b border-[var(--border)] hover:bg-[var(--bg2)]">
                    <td className="py-2 pr-3 text-[var(--t3)]">{bm}</td>
                    {compared.map(m => {
                      const score = m.benchmarks[bm]
                      return (
                        <td key={m.id} className="px-3 py-2">
                          {score != null ? (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded bg-[var(--bg)]">
                                <div className="h-full rounded" style={{ width: `${score}%`, backgroundColor: m.color }} />
                              </div>
                              <span className={`font-mono font-semibold ${score === best ? 'text-green-700' : 'text-[var(--t1)]'}`}>
                                {score}
                                {score === best && <span className="ml-1 text-[9px]">★</span>}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--t3)]">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Architecture */}
              <tr className="border-b border-[var(--border)] hover:bg-[var(--bg2)]">
                <td className="py-2 pr-3 text-[var(--t3)]">Architecture</td>
                {compared.map(m => (
                  <td key={m.id} className="px-3 py-2 text-[var(--t2)]">
                    {editingModel === m.id ? (
                      <input value={editFields.architecture || ''}
                        onChange={e => setEditFields(p => ({ ...p, architecture: e.target.value }))}
                        className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-1 text-xs" />
                    ) : (m.architecture || '—')}
                  </td>
                ))}
              </tr>

              {/* Innovation */}
              <tr className="border-b border-[var(--border)] hover:bg-[var(--bg2)]">
                <td className="py-2 pr-3 text-[var(--t3)]">Innovation</td>
                {compared.map(m => (
                  <td key={m.id} className="px-3 py-2 text-[var(--t2)] max-w-[220px]">
                    {editingModel === m.id ? (
                      <textarea value={editFields.innovation || ''}
                        onChange={e => setEditFields(p => ({ ...p, innovation: e.target.value }))}
                        className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-1 text-xs"
                        rows={2} />
                    ) : (m.innovation || '—')}
                  </td>
                ))}
              </tr>

              {/* Save row */}
              {editingModel && (
                <tr>
                  <td />
                  {compared.map(m => (
                    <td key={m.id} className="px-3 py-2">
                      {editingModel === m.id && (
                        <button
                          onClick={() => saveEdit(m.id)}
                          disabled={saveLoading}
                          className="rounded bg-blue-500 px-3 py-1 text-[11px] text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                          {saveLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Annotation panels */}
      {compared.map(m => activeAnnotModel === m.id && (
        <div key={`annot-${m.id}`} className="border-t border-[var(--border)] bg-[var(--bg2)] px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="text-xs font-semibold text-[var(--t1)]">{m.name} — Annotations</span>
            <button onClick={() => setActiveAnnotModel(null)} className="ml-auto text-[var(--t3)] hover:text-[var(--t1)]">✕</button>
          </div>

          {/* Existing annotations */}
          <div className="mb-3 space-y-2">
            {(annotations[m.id] ?? []).length === 0 && (
              <p className="text-xs text-[var(--t3)]">No annotations yet. Be the first.</p>
            )}
            {(annotations[m.id] ?? []).map(a => (
              <div key={a.id} className={`rounded-lg border bg-[var(--bg)] px-3 py-2 ${a.is_pinned ? 'border-amber-300' : 'border-[var(--border)]'}`}>
                <div className="mb-1 flex items-center gap-2">
                  {a.is_pinned && <span className="text-amber-500 text-[10px]">📌</span>}
                  <span className="text-xs font-semibold text-[var(--t1)]">{a.author_name}</span>
                  <span className="text-[10px] text-[var(--t3)]">{new Date(a.created_at).toLocaleDateString()}</span>
                  <button
                    onClick={() => deleteAnnotation(a.id, m.id)}
                    disabled={!canEdit}
                    className="ml-auto text-[10px] text-[var(--t3)] hover:text-red-500"
                  >✕</button>
                </div>
                <p className="text-xs text-[var(--t2)]">{a.content}</p>
              </div>
            ))}
          </div>

          {/* New annotation form */}
          <div className="flex gap-2">
            <input
              placeholder="Your name"
              value={newAuthor}
              onChange={e => setNewAuthor(e.target.value)}
              disabled={!canEdit}
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--t1)] focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <input
              placeholder="Add a note about this model..."
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitAnnotation(m.id)}
              disabled={!canEdit}
              className="flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--t1)] focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={() => submitAnnotation(m.id)}
              disabled={!canEdit || annotLoading || !newContent.trim()}
              className="rounded bg-blue-500 px-3 py-1 text-[11px] text-white hover:bg-blue-600 disabled:opacity-40"
            >
              Post
            </button>
          </div>
          {!canEdit && (
            <p className="mt-2 text-[10px] text-[var(--t3)]">Sign in to post annotations or edit compared models.</p>
          )}
        </div>
      ))}
    </div>
  )
}
