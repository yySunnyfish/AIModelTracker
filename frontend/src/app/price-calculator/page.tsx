'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function PriceCalculatorPage() {
  const [inputM, setInputM] = useState(1)
  const [outputM, setOutputM] = useState(0.5)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/price-calculator?input=${inputM}&output=${outputM}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setResults(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [inputM, outputM])

  const maxCost = Math.max(...results.map(r => r.totalCost), 1)

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
        <Link href="/" className="text-xs text-[var(--t3)] hover:text-[var(--t1)]">← Back</Link>
        <h1 className="text-sm font-semibold text-[var(--t1)]">Price Calculator</h1>
        <span className="text-xs text-[var(--t3)]">Cost comparison across models</span>
      </div>

      {/* Controls */}
      <div className="border-b border-[var(--border)] bg-[var(--bg2)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--t2)]">Input tokens (M)</label>
            <input
              type="number"
              value={inputM}
              min={0.1}
              step={0.5}
              onChange={e => setInputM(parseFloat(e.target.value) || 0.1)}
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--t1)] focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--t2)]">Output tokens (M)</label>
            <input
              type="number"
              value={outputM}
              min={0.1}
              step={0.5}
              onChange={e => setOutputM(parseFloat(e.target.value) || 0.1)}
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--t1)] focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="text-xs text-[var(--t3)]">
            Total: <span className="font-mono font-semibold text-[var(--t1)]">{(inputM + outputM).toFixed(1)}M</span> tokens
          </div>
          {loading && <span className="text-xs text-[var(--t3)]">Loading...</span>}
        </div>
      </div>

      {/* Results */}
      <div className="p-5">
        <div className="mb-2 text-xs text-[var(--t3)]">
          {results.length} models · sorted by total cost (cheapest first)
        </div>
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-4 py-3">
              <span className="w-5 text-right text-xs font-mono text-[var(--t3)]">{i + 1}</span>
              <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <div className="w-40 flex-shrink-0">
                <div className="text-xs font-semibold text-[var(--t1)]">{r.name}</div>
                <div className="text-2-xs text-[var(--t3)]">{r.company}</div>
              </div>
              <div className="flex flex-1 items-center gap-2">
                <div className="h-4 overflow-hidden rounded bg-[var(--bg)] flex-1">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${Math.max((r.totalCost / maxCost) * 100, 2)}%`,
                      backgroundColor: r.color,
                    }}
                  />
                </div>
                <span className="w-16 text-right text-xs font-mono font-semibold text-[var(--t1)]">
                  {r.totalCost === 0 ? 'Free' : `$${r.totalCost.toFixed(2)}`}
                </span>
              </div>
              <div className="w-32 text-right text-2-xs text-[var(--t3)]">
                ${r.inputPrice} / ${r.outputPrice} per M
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-2-xs ${
                r.license === 'open'
                  ? 'border-green-300 bg-green-50 text-green-800'
                  : 'border-red-300 bg-red-50 text-red-800'
              }`}>
                {r.license}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
