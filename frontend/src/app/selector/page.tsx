'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'general', label: 'General' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'code', label: 'Code' },
  { key: 'multimodal', label: 'Multimodal' },
  { key: 'edge', label: 'Edge' },
  { key: 'world', label: 'World Model' },
]

export default function SelectorPage() {
  const [license, setLicense] = useState('')
  const [category, setCategory] = useState('')
  const [maxPrice, setMaxPrice] = useState(20)
  const [minSwe, setMinSwe] = useState(0)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (license) params.set('license', license)
    if (category) params.set('category', category)
    params.set('maxPrice', maxPrice.toString())
    params.set('minSwe', minSwe.toString())

    fetch(`/api/selector?${params}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setResults(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [license, category, maxPrice, minSwe])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
        <Link href="/" className="text-xs text-[var(--t3)] hover:text-[var(--t1)]">← Back</Link>
        <h1 className="text-sm font-semibold text-[var(--t1)]">Model Selector</h1>
        <span className="text-xs text-[var(--t3)]">Multi-criteria model recommendation</span>
      </div>

      {/* Filters */}
      <div className="border-b border-[var(--border)] bg-[var(--bg2)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-5">
          {/* License */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--t2)]">License</span>
            {[{k:'',l:'All'},{k:'open',l:'Open'},{k:'closed',l:'Closed'},{k:'partial',l:'Partial'}].map(({k,l}) => (
              <button key={k} onClick={() => setLicense(k)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${license === k ? 'border-[var(--t1)] bg-[var(--t1)] text-white' : 'border-[var(--border)] text-[var(--t2)]'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Category */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--t2)]">Category</span>
            {CATEGORIES.map(({key, label}) => (
              <button key={key} onClick={() => setCategory(key)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${category === key ? 'border-[var(--t1)] bg-[var(--t1)] text-white' : 'border-[var(--border)] text-[var(--t2)]'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Max price */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--t2)]">Max input price</span>
            <span className="text-xs font-mono text-[var(--t1)]">${maxPrice}/M</span>
            <input type="range" min={0} max={20} step={0.5} value={maxPrice}
              onChange={e => setMaxPrice(parseFloat(e.target.value))}
              className="w-28 accent-blue-500" />
          </div>

          {/* Min SWE */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--t2)]">Min SWE-bench</span>
            <span className="text-xs font-mono text-[var(--t1)]">{minSwe}%</span>
            <input type="range" min={0} max={90} step={5} value={minSwe}
              onChange={e => setMinSwe(parseInt(e.target.value))}
              className="w-28 accent-green-500" />
          </div>

          {loading && <span className="text-xs text-[var(--t3)]">Loading...</span>}
        </div>
      </div>

      {/* Results grid */}
      <div className="p-5">
        <div className="mb-3 text-xs text-[var(--t3)]">{results.length} models matched</div>
        <div className="grid grid-cols-3 gap-3">
          {results.map((m) => (
            <div key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg2)] p-4"
              style={{ borderTopColor: m.color, borderTopWidth: '3px' }}>
              <div className="mb-1 flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-[var(--t1)]">{m.name}</div>
                  <div className="text-2-xs text-[var(--t3)]">{m.company} · {m.region}</div>
                </div>
                <span className={`rounded-full border px-1.5 py-0.5 text-2-xs ${
                  m.license === 'open' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
                }`}>{m.license}</span>
              </div>

              <div className="mb-2 mt-2 grid grid-cols-2 gap-1 text-2-xs">
                <span className="text-[var(--t3)]">Params</span>
                <span className="text-right font-mono text-[var(--t1)]">{m.params || '—'}</span>
                <span className="text-[var(--t3)]">Context</span>
                <span className="text-right font-mono text-[var(--t1)]">{m.contextWindow || '—'}</span>
                <span className="text-[var(--t3)]">Price in/out</span>
                <span className="text-right font-mono text-amber-700">
                  {m.inputPrice > 0 ? `$${m.inputPrice}/$${m.outputPrice}` : 'Free'}
                </span>
              </div>

              <div className="flex gap-2">
                {m.swe !== null && (
                  <div className="flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-center">
                    <div className="text-2-xs text-[var(--t3)]">SWE-bench</div>
                    <div className="text-xs font-semibold text-[var(--t1)]">{m.swe}</div>
                  </div>
                )}
                {m.mmlu !== null && (
                  <div className="flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-center">
                    <div className="text-2-xs text-[var(--t3)]">MMLU</div>
                    <div className="text-xs font-semibold text-[var(--t1)]">{m.mmlu}</div>
                  </div>
                )}
              </div>

              {m.innovation && (
                <p className="mt-2 text-2-xs text-[var(--t3)] line-clamp-2">{m.innovation}</p>
              )}
            </div>
          ))}
        </div>
        {results.length === 0 && !loading && (
          <div className="py-12 text-center text-xs text-[var(--t3)]">No models match your criteria. Try relaxing the filters.</div>
        )}
      </div>
    </div>
  )
}
