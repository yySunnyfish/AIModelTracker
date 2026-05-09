'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/Header'
import { ScrapeModal } from '@/components/ScrapeModal'
import { DiscoverModal } from '@/components/DiscoverModal'
import { LLM_MODELS, LLM_CATEGORIES, EMBODIED_MODELS, LLM_LEADERBOARDS, KPI_DATA, EMBODIED_LEADERBOARDS } from '@/data/static'
import { MODEL_PROFILES } from '@/data/model_profiles'
import { DIM_META, DIM_ORDER, getCapabilityScores } from '@/data/model_scores'

const EMBODIED_CATEGORIES = ['world', 'robotics', 'ad']

const COMPANY_COLORS: Record<string, string> = {
  'OpenAI':               '#10A37F',
  'Anthropic':            '#D97706',
  'Google DeepMind':      '#1A73E8',
  'Meta':                 '#0866FF',
  'Mistral AI':           '#FF7000',
  'DeepSeek':             '#E24B4A',
  'Alibaba':              '#FF6A00',
  'MiniMax':              '#0891B2',
  'Zhipu AI':             '#7C3AED',
  'Moonshot AI':          '#E85D24',
  'Amazon':               '#FF9900',
  'xAI':                  '#6B7280',
  'Xiaomi':               '#FF6900',
  'Physical Intelligence':'#059669',
  'Waymo':                '#E24B4A',
  'Wayve':                '#7C3AED',
  'Baidu':                '#2932E1',
  'StepFun':              '#06B6D4',
}

function modelColor(m: any): string {
  if (m.companyColor && m.companyColor !== '#888') return m.companyColor
  return COMPANY_COLORS[m.company] ?? '#94A3B8'
}

function parseParams(raw: string | undefined): { total: string; active: string | null } {
  if (!raw) return { total: '—', active: null }
  const m = raw.match(/^(.+?)-A(.+)$/)
  return m ? { total: m[1], active: m[2] } : { total: raw, active: null }
}

function ctxToK(s: string | undefined): number {
  if (!s) return 0
  const m = s.match(/^([\d.]+)\s*([KMG]?)$/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const u = (m[2] || '').toUpperCase()
  if (u === 'M') return Math.round(n * 1000)
  if (u === 'G') return Math.round(n * 1_000_000)
  return Math.round(n)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LicBadge({ lic }: { lic: string }) {
  const map = {
    open:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
    partial: 'bg-amber-50 text-amber-700 ring-amber-200',
    closed:  'bg-slate-100 text-slate-500 ring-slate-200',
  } as any
  const label = { open: 'Open', partial: 'Partial', closed: 'Closed' } as any
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium ring-1 ${map[lic] ?? map.closed}`}>
      {label[lic] ?? 'Closed'}
    </span>
  )
}

// Model card — clean 130px wide, inspired by artificialanalysis.ai
function ModelCard({ model, selected, onClick }: { model: any; selected: boolean; onClick: () => void }) {
  const color = modelColor(model)
  const lic   = model.lic || model.license || 'closed'

  const scores   = getCapabilityScores(model)
  const topScore = DIM_ORDER.reduce<{ label: string; score: number; color: string } | null>((best, k) => {
    const s = scores[k]
    if (s == null || s === 0) return best
    return (!best || s > best.score) ? { label: DIM_META[k].abbr, score: Math.round(s), color: DIM_META[k].color } : best
  }, null)

  return (
    <div
      onClick={onClick}
      style={{ borderLeftColor: color, borderLeftWidth: 3, ...(selected ? { boxShadow: `0 0 0 2px ${color}44` } : {}) } as any}
      className={`group relative flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 transition-all duration-150 hover:shadow-md ${
        selected ? 'shadow-md' : ''
      }`}
    >
      {/* Company + date */}
      <div className="flex items-center justify-between">
        <span className="max-w-[74px] truncate text-[9px] font-medium text-[var(--t3)]" style={{ color }}>
          {model.company}
        </span>
        <span className="text-[9px] tabular-nums text-[var(--t3)]">
          {model.date
            ? (model.date.slice(8,10) + '-' + model.date.slice(5,7) + '-' + model.date.slice(2,4))
            : '—'}
        </span>
      </div>

      {/* Model name */}
      <div className="min-h-[28px] text-[11px] font-semibold leading-snug text-[var(--t1)] line-clamp-2">
        {model.name}
      </div>

      {/* Top capability bar */}
      {topScore ? (
        <div>
          <div className="mb-0.5 flex items-center justify-between">
            <span className="text-[9px] text-[var(--t3)]">{topScore.label}</span>
            <span className="text-[9px] font-semibold tabular-nums" style={{ color: topScore.color }}>{topScore.score}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg2)]">
            <div className="h-full rounded-full transition-all" style={{ width: `${topScore.score}%`, backgroundColor: topScore.color }} />
          </div>
        </div>
      ) : (
        <div className="h-4" />
      )}

      {/* Footer: params + license */}
      <div className="flex items-center justify-between">
        {model.params ? (
          <span className="text-[9px] font-mono text-[var(--t3)]">
            {(() => { const { total, active } = parseParams(model.params); return active ? `${total}/${active}` : total })()}
          </span>
        ) : model.ctx ? (
          <span className="text-[9px] font-mono text-[var(--t3)]">{model.ctx}</span>
        ) : <span />}
        <LicBadge lic={lic} />
      </div>
    </div>
  )
}

function KPIItem({
  label, value, delta, sub, bar, color,
}: {
  label: string; value: string; delta?: string; sub?: string;
  bar?: { pct: number; color: string }; color?: string;
}) {
  return (
    <div className="flex flex-col justify-between px-5 py-4">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--t3)]">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-[var(--t1)]" style={color ? { color } : undefined}>{value}</span>
        {delta && <span className="text-[10px] font-medium text-emerald-600">{delta}</span>}
      </div>
      {bar && (
        <div className="my-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--bg2)]">
          <div className="h-full rounded-full" style={{ width: `${Math.round(bar.pct * 100)}%`, backgroundColor: bar.color }} />
        </div>
      )}
      {sub && <div className="mt-1 text-[10px] text-[var(--t3)]">{sub}</div>}
    </div>
  )
}

function BenchmarkBar({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-16 shrink-0 text-[10px] text-[var(--t2)]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg2)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((score / max) * 100)}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] font-semibold tabular-nums text-[var(--t1)]">{score}</span>
    </div>
  )
}

function RightPanel({ model, onClose }: { model: any; onClose: () => void }) {
  const color      = modelColor(model)
  const lic        = model.lic || model.license || 'closed'
  const staticProf = MODEL_PROFILES[model.name]
  const dbProf     = model.rich_profile ?? null
  // Merge: DB values override static, fall back gracefully
  const profile = {
    capabilities: (dbProf?.capabilities?.length  ? dbProf.capabilities  : staticProf?.capabilities) ?? [],
    applications: (dbProf?.applications?.length  ? dbProf.applications  : staticProf?.applications) ?? [],
    innovation:   staticProf?.innovation ?? null,
    impact: (dbProf?.impact_tags?.length || dbProf?.impact_summary)
      ? { tags: dbProf.impact_tags ?? [], summary: dbProf.impact_summary ?? '' }
      : staticProf?.impact ?? null,
  }
  const modalities: string[] = typeof model.modal === 'string'
    ? model.modal.split(' ').filter(Boolean)
    : Array.isArray(model.modal) ? model.modal : []

  return (
    <aside
      className="w-[308px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] sticky top-0 self-start h-full overflow-y-auto"
      style={{ borderTopColor: color, borderTopWidth: '3px' }}
    >
      <div className="divide-y divide-[var(--border)]">

        {/* ── Header ── */}
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate text-[11px] font-medium" style={{ color }}>{model.company}</span>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-[var(--t3)] hover:bg-[var(--bg2)] hover:text-[var(--t1)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className="text-[16px] font-bold leading-snug text-[var(--t1)]">{model.name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-[var(--t3)]">{model.date ?? '—'}</span>
            <span className="text-[var(--border)]">·</span>
            <span className="capitalize text-[10px] text-[var(--t3)]">{model.category}</span>
            <span className="text-[var(--border)]">·</span>
            <LicBadge lic={lic} />
          </div>
        </div>

        {/* ── Key Specs ── */}
        {(() => {
          const pp = parseParams(model.params)
          const specs = [
            { label: pp.active ? 'Total Params' : 'Parameters', value: pp.total },
            { label: 'Active Params', value: pp.active || '—' },
            { label: 'Context', value: model.ctx || model.context_window || '—' },
            { label: 'Price in',  value: (model.pi ?? 0) > 0 ? `$${model.pi}/M` : 'Free' },
            { label: 'Price out', value: (model.po ?? 0) > 0 ? `$${model.po}/M` : 'Free' },
            ...(model.tps ? [{ label: 'Speed', value: `${model.tps} t/s` }] : []),
          ]
          return (
            <div className="p-4">
              <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Specifications</div>
              <div className="grid grid-cols-2 gap-2">
                {specs.map(s => (
                  <div key={s.label} className="rounded-lg bg-[var(--bg2)] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-[var(--t3)]">{s.label}</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-[var(--t1)]">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Capabilities ── */}
        {(() => {
          const caps = profile.capabilities
          // For models without profile data, derive basic capabilities from category/modalities
          const derived: string[] = caps.length ? caps : (() => {
            const tags: string[] = []
            const cat = (model.category ?? '').toLowerCase()
            const mods: string[] = typeof model.modal === 'string'
              ? model.modal.split(' ').filter(Boolean)
              : Array.isArray(model.modal) ? model.modal : []
            if (cat === 'reasoning' || cat === 'math') tags.push('Chain-of-thought reasoning')
            if (cat === 'coding')    tags.push('Code generation')
            if (mods.some(m => ['vision', 'image'].includes(m))) tags.push('Visual understanding')
            if (mods.includes('audio')) tags.push('Audio processing')
            if (mods.includes('image-gen')) tags.push('Image generation')
            if (!tags.some(t => t.includes('Text'))) tags.push('Text generation')
            if (cat === 'general' || !cat) tags.push('Instruction following')
            return tags
          })()
          return (
            <div className="p-4">
              <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Capabilities</div>
              <div className="flex flex-wrap gap-1.5">
                {derived.map(cap => (
                  <span key={cap}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
                    style={{ color, backgroundColor: color + '12', '--tw-ring-color': color + '40' } as any}
                  >
                    {cap}
                  </span>
                ))}
              </div>
              {modalities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {modalities.map(m => (
                    <span key={m} className="rounded-md border border-[var(--border)] bg-[var(--bg2)] px-1.5 py-0.5 text-[9px] text-[var(--t2)]">{m}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Performance Scores ── */}
        {(() => {
          const scores = getCapabilityScores(model)
          const hasSome = DIM_ORDER.some(k => scores[k] != null && scores[k] !== 0)
          if (!hasSome) return null
          return (
            <div className="p-4">
              <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Performance</div>
              <div className="space-y-2">
                {DIM_ORDER.map(k => {
                  const d = DIM_META[k]
                  const s = scores[k]
                  if (s == null || s === 0) return null
                  return <BenchmarkBar key={k} label={d.label} score={Math.round(s)} max={100} color={d.color} />
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Tech Innovation ── */}
        {(profile.innovation || model.arch || model.innov) && (
          <div className="p-4">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Architecture & Innovation</div>
            <div className="rounded-lg bg-[var(--bg2)] p-3 text-[11px] leading-relaxed text-[var(--t2)]">
              {profile.innovation ?? [
                model.arch  && <div key="arch"><span className="font-medium text-[var(--t1)]">Arch: </span>{model.arch}</div>,
                model.innov && <div key="innov" className="mt-1"><span className="font-medium text-[var(--t1)]">Innovation: </span>{model.innov}</div>,
              ]}
            </div>
          </div>
        )}

        {/* ── Applications ── */}
        {profile.applications.length > 0 && (
          <div className="p-4">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Applications</div>
            <div className="flex flex-wrap gap-1.5">
              {(profile.applications as string[]).map(app => (
                <span key={app} className="rounded-md border border-[var(--border)] bg-[var(--bg2)] px-2 py-0.5 text-[10px] text-[var(--t2)]">
                  {app}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Industry Impact ── */}
        {profile.impact && (
          <div className="p-4">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Industry Impact</div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(profile.impact.tags as string[]).map(tag => (
                <span key={tag}
                  className="rounded-full px-2 py-0.5 text-[9px] font-medium ring-1"
                  style={{ color: color, backgroundColor: color + '0d', '--tw-ring-color': color + '33' } as any}
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--t2)]">{profile.impact.summary}</p>
          </div>
        )}

      </div>
    </aside>
  )
}

function LeaderboardCard({ title, items, startRank = 1 }: { title: string; items: any[]; startRank?: number }) {
  const maxScore = Math.max(...items.map(i => i.score), 1)
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 hover:shadow-sm transition-shadow">
      <div className="mb-3 text-[11px] font-semibold text-[var(--t2)]">{title}</div>
      <div className="space-y-2.5">
        {items.map((item, idx) => (
          <div key={item.name}>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="w-4 shrink-0 text-right text-[9px] font-mono text-[var(--t3)]">{startRank + idx}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--t2)]">{item.name}</span>
              <span className="text-[10px] font-semibold tabular-nums text-[var(--t1)]">{item.score}</span>
            </div>
            <div className="ml-5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg2)]">
              <div className="h-full rounded-full transition-all" style={{ width: `${(item.score / maxScore) * 100}%`, backgroundColor: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Timeline section component ───────────────────────────────────────────────

function TimelineSection({
  label, icon, models: sectionModels, allMonths, selectedModel, onSelect,
  alignEnd,
}: {
  label: string; icon: string; models: any[]; allMonths: string[];
  selectedModel: string | null; onSelect: (id: string) => void; alignEnd?: boolean;
}) {
  if (sectionModels.length === 0) return null
  const byMonth = Object.fromEntries(allMonths.map(mo => [mo, sectionModels.filter(m => m.date?.startsWith(mo))]))

  return (
    <div>
      {/* Section row label */}
      <div className="sticky left-0 z-10 mb-1 inline-flex items-center gap-1.5 rounded-r-full bg-[var(--bg2)] py-0.5 pl-3 pr-4 text-[10px] font-semibold text-[var(--t2)]">
        <span>{icon}</span>
        <span>{label}</span>
        <span className="font-mono font-normal text-[var(--t3)]">({sectionModels.length})</span>
      </div>

      {/* Cards row */}
      <div className={`flex min-h-[140px] items-${alignEnd ? 'end' : 'start'} gap-3`}>
        {allMonths.map(month => {
          const cols = byMonth[month] ?? []
          const colW = Math.max(cols.length, 1) * 140
          return (
            <div key={month} className="shrink-0 flex gap-2" style={{ width: colW }}>
              {cols.map((m: any) => (
                <ModelCard
                  key={m.id} model={m}
                  selected={selectedModel === m.id}
                  onClick={() => onSelect(m.id)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeView,        setActiveView]        = useState('timeline')
  const [activeCategory,    setActiveCategory]    = useState('llm')
  const [activeSubCategory, setActiveSubCategory] = useState('all')
  const [selectedModel,     setSelectedModel]     = useState<string | null>(null)
  const [activeLeaderboard, setActiveLeaderboard] = useState('swe')
  const [lbCategory,        setLbCategory]        = useState<'llm' | 'embodied'>('llm')
  const [dbModels,          setDbModels]          = useState<any[] | null>(null)
  const [dbLeaderboard,     setDbLeaderboard]     = useState<Record<string, any[]>>({})
  const [loading,           setLoading]           = useState(true)
  const [showScrape,        setShowScrape]        = useState(false)
  const [showDiscover,      setShowDiscover]      = useState(false)
  const [showAllTimeline,   setShowAllTimeline]   = useState(false)

  useEffect(() => {
    fetchDbModels()
  }, [])

  function fetchDbModels() {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setDbModels(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/benchmarks?name=SWE-bench').then(r => r.json()),
      fetch('/api/benchmarks?name=MMLU').then(r => r.json()),
    ]).then(([swe, mmlu]) => {
      const fixColor = (items: any[]) => items.map(item => ({
        ...item,
        color: (item.color && item.color !== '#888') ? item.color : (COMPANY_COLORS[item.company] ?? '#94A3B8'),
      }))
      setDbLeaderboard({ swe: Array.isArray(swe) ? fixColor(swe) : [], mmlu: Array.isArray(mmlu) ? fixColor(mmlu) : [] })
    }).catch(() => {})
  }, [])

  // ── Derived data ─────────────────────────────────────────────────────────
  const allModels      = (() => {
    const staticAll = [...LLM_MODELS, ...EMBODIED_MODELS]
    if (!dbModels || dbModels.length === 0) return staticAll
    const dbNames = new Set(dbModels.map((m: any) => (m.name ?? '').toLowerCase()))
    const staticOnly = staticAll.filter(m => !dbNames.has((m.name ?? '').toLowerCase()))
    return [...dbModels, ...staticOnly]
  })()
  const llmModels      = allModels.filter(m => !EMBODIED_CATEGORIES.includes(m.category))
  const embodiedModels = allModels.filter(m =>  EMBODIED_CATEGORIES.includes(m.category))
  const models         = activeCategory === 'llm' ? llmModels : embodiedModels
  const categories     = activeCategory === 'llm' ? LLM_CATEGORIES : []

  const filteredModels = activeSubCategory === 'all'
    ? models
    : models.filter(m => m.category === activeSubCategory)

  // ── Stats ─────────────────────────────────────────────────────────────────
  const openCount      = allModels.filter(m => (m.lic || m.license) === 'open').length
  const reasoningCount = allModels.filter(m => m.category === 'reasoning').length
  const companies      = [...new Set(allModels.map(m => m.company).filter(Boolean))]
  const latestDate     = [...allModels].filter(m => m.date).map(m => m.date).sort().pop() ?? '—'

  // ── Timeline ─────────────────────────────────────────────────────────────
  const TODAY      = '2026-04-26'
  const cutoffDate = (() => { const d = new Date(TODAY); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) })()

  const sortedModels   = [...filteredModels].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const recentModels   = sortedModels.filter(m => (m.date ?? '') >= cutoffDate)
  const olderModels    = sortedModels.filter(m => (m.date ?? '') <  cutoffDate)
  const timelineModels = showAllTimeline ? sortedModels : recentModels

  const cloudModels = timelineModels.filter(m => m.category !== 'edge')
  const edgeModels  = timelineModels.filter(m => m.category === 'edge')

  const allMonths = [...new Set(timelineModels.map(m => m.date?.slice(0, 7) ?? '').filter(Boolean))].sort()

  const selectedModelData = allModels.find(m => m.id === selectedModel)

  // ── Leaderboard lists ─────────────────────────────────────────────────────
  const tpsLb = [...(dbModels ?? [])]
    .filter(m => m.tps).sort((a, b) => (b.tps ?? 0) - (a.tps ?? 0)).slice(0, 6)
    .map(m => ({ name: m.name, score: m.tps as number, color: modelColor(m) }))

  const ctxLb = [...(dbModels ?? [])]
    .filter(m => ctxToK(m.ctx) > 0).sort((a, b) => ctxToK(b.ctx) - ctxToK(a.ctx)).slice(0, 6)
    .map(m => ({ name: m.name, score: ctxToK(m.ctx), color: modelColor(m) }))

  const priceCandidates = [...(dbModels ?? [])]
    .filter(m => (m.pi ?? 0) > 0).sort((a, b) => (a.pi ?? 0) - (b.pi ?? 0)).slice(0, 6)
  const maxPiInSet = Math.max(...priceCandidates.map(m => m.pi ?? 1), 1)
  const priceLb = priceCandidates.map(m => ({
    name: `${m.name}  $${m.pi}`, score: Math.round((1 - (m.pi ?? 0) / maxPiInSet) * 90 + 10), color: modelColor(m),
  }))

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]">
      <Header activeView={activeView} onNavChange={setActiveView}
        onAddModel={() => setShowScrape(true)}
        onDiscoverModels={() => setShowDiscover(true)} />

      {showScrape && (
        <ScrapeModal
          onClose={() => setShowScrape(false)}
          onSaved={() => { setShowScrape(false); fetchDbModels() }}
          existingModels={(dbModels ?? []).map((m: any) => ({ id: m.id, name: m.name, company: m.company ?? '' }))}
        />
      )}

      {showDiscover && (
        <DiscoverModal
          onClose={() => setShowDiscover(false)}
          onSaved={() => { setShowDiscover(false); fetchDbModels() }}
        />
      )}

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-5 divide-x divide-[var(--border)] border-b border-[var(--border)] bg-[var(--bg)]">
        <KPIItem
          label="Models Tracked"
          value={allModels.length.toString()}
          delta={dbModels ? 'live' : undefined}
          sub={`${llmModels.length} LLM · ${embodiedModels.length} Embodied`}
        />
        <KPIItem
          label="Companies"
          value={companies.length.toString()}
          sub={companies.slice(0, 4).join(' · ') + (companies.length > 4 ? ' …' : '')}
        />
        <KPIItem
          label="Open-Source"
          value={allModels.length ? `${Math.round(openCount / allModels.length * 100)}%` : '—'}
          sub={`${openCount} open · ${allModels.length - openCount} closed`}
          bar={{ pct: allModels.length ? openCount / allModels.length : 0, color: '#059669' }}
        />
        <KPIItem
          label="Reasoning Models"
          value={reasoningCount.toString()}
          sub={`${Math.round(reasoningCount / Math.max(allModels.length, 1) * 100)}% of tracked`}
          bar={{ pct: reasoningCount / Math.max(allModels.length, 1), color: '#7C3AED' }}
        />
        <KPIItem
          label="Latest Release"
          value={latestDate !== '—' ? latestDate.slice(0, 7) : '—'}
          sub={loading ? 'Fetching…' : 'Most recent model'}
        />
      </div>

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto">

          {/* ══════════════ TIMELINE VIEW ══════════════ */}
          {activeView === 'timeline' && (
            <div className="flex flex-col">

              {/* Top toolbar: LLM / Embodied tabs + subcategory filter */}
              <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)] shadow-sm">
                {/* LLM / Embodied toggle */}
                <div className="flex border-b border-[var(--border)]">
                  {[
                    { id: 'llm',      label: 'Language Models',        sub: 'Cloud · Edge · Reasoning · Code · Multimodal', count: llmModels.length,      dot: '#1A73E8' },
                    { id: 'embodied', label: 'Embodied / World Models', sub: 'Robotics · Autonomous · World',               count: embodiedModels.length,  dot: '#059669' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveCategory(tab.id); setActiveSubCategory('all') }}
                      className={`flex flex-1 items-center gap-3 border-b-2 px-5 py-3 text-left transition-colors first:border-r first:border-[var(--border)] ${
                        activeCategory === tab.id
                          ? 'border-[var(--t1)] bg-[var(--bg)]'
                          : 'border-transparent bg-[var(--bg2)] hover:bg-[var(--bg)]'
                      }`}
                    >
                      <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tab.dot }} />
                      <div>
                        <div className={`text-[12px] font-semibold ${activeCategory === tab.id ? 'text-[var(--t1)]' : 'text-[var(--t2)]'}`}>{tab.label}</div>
                        <div className="text-[10px] text-[var(--t3)]">{tab.sub}</div>
                      </div>
                      <span className="ml-auto rounded-full bg-[var(--bg2)] px-2 py-0.5 text-[10px] font-mono font-medium text-[var(--t2)] ring-1 ring-[var(--border)]">
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Subcategory pills */}
                {categories.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5">
                    <span className="shrink-0 text-[10px] font-medium text-[var(--t3)]">Filter by</span>
                    {categories.map(cat => {
                      const count = cat.key === 'all' ? models.length : models.filter(m => m.category === cat.key).length
                      return (
                        <button
                          key={cat.key}
                          onClick={() => setActiveSubCategory(cat.key)}
                          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                            activeSubCategory === cat.key
                              ? 'bg-[var(--t1)] text-white shadow-sm'
                              : 'bg-[var(--bg2)] text-[var(--t2)] hover:bg-[var(--border)] hover:text-[var(--t1)]'
                          }`}
                        >
                          {cat.color && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: activeSubCategory === cat.key ? 'white' : cat.color }} />
                          )}
                          {cat.label}
                          <span className={`rounded-full px-1 text-[9px] font-mono ${activeSubCategory === cat.key ? 'bg-white/20' : 'bg-[var(--border)]'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Timeline header bar */}
              <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--bg2)] px-4 py-2">
                <div className="flex items-center gap-2 text-[11px] text-[var(--t2)]">
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                  <span>Cloud Models</span>
                  <span className="font-mono text-[var(--t3)]">({cloudModels.length})</span>
                </div>
                <div className="h-3 w-px bg-[var(--border)]" />
                <div className="flex items-center gap-2 text-[11px] text-[var(--t2)]">
                  <div className="h-2 w-2 rounded-full bg-violet-400" />
                  <span>Edge Models</span>
                  <span className="font-mono text-[var(--t3)]">({edgeModels.length})</span>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-[11px] text-[var(--t3)]">
                    {showAllTimeline
                      ? `Showing all ${sortedModels.length} models`
                      : `Last 3 months · ${recentModels.length} models · ${cutoffDate.slice(0, 7)} – ${TODAY.slice(0, 7)}`}
                  </span>
                  {olderModels.length > 0 && (
                    <button
                      onClick={() => setShowAllTimeline(s => !s)}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[11px] font-medium text-[var(--t2)] transition-all hover:border-[var(--t3)] hover:text-[var(--t1)]"
                    >
                      {showAllTimeline ? (
                        <>
                          <span>↑</span>
                          <span>Collapse history</span>
                        </>
                      ) : (
                        <>
                          <span>↓</span>
                          <span>Show {olderModels.length} older models</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* ── Scrollable timeline canvas ── */}
              <div className="overflow-x-auto p-4">
                {allMonths.length === 0 ? (
                  <div className="flex items-center justify-center py-20 text-[var(--t3)]">
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--t2)]" />
                        <span>Loading models…</span>
                      </div>
                    ) : 'No models found'}
                  </div>
                ) : (
                  <div className="flex min-w-max gap-0">

                    {/* ── Left section labels (fixed, non-scrolling content) ── */}
                    <div className="mr-3 flex shrink-0 flex-col pt-8">
                      <div className="flex h-full flex-col">
                        {/* Cloud label */}
                        <div className="flex items-center gap-1.5 pb-2">
                          <div className="h-2 w-2 rounded-full bg-blue-400" />
                          <span className="whitespace-nowrap text-[10px] font-semibold text-blue-600">Cloud / API</span>
                        </div>
                        {/* Divider placeholder height — matches the divider row */}
                        {edgeModels.length > 0 && <div className="py-3"><div className="h-px w-full" /></div>}
                        {/* Edge label */}
                        {edgeModels.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-2">
                            <div className="h-2 w-2 rounded-full bg-violet-400" />
                            <span className="whitespace-nowrap text-[10px] font-semibold text-violet-600">Edge / Local</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Month columns ── */}
                    {allMonths.map(month => {
                      const monthCloud = cloudModels.filter(m => m.date?.startsWith(month))
                      const monthEdge  = edgeModels.filter(m => m.date?.startsWith(month))
                      return (
                        <div key={month} className="mr-4 shrink-0 last:mr-0" style={{ width: 152 }}>
                          {/* Month header */}
                          <div className="mb-3 flex items-center gap-1.5 border-l border-[var(--border)] pl-2">
                            <span className="text-[11px] font-mono font-semibold text-[var(--t3)]">{month}</span>
                          </div>

                          {/* Cloud cards — stack vertically */}
                          <div className="flex flex-col gap-2">
                            {monthCloud.map((m: any) => (
                              <ModelCard key={m.id} model={m} selected={selectedModel === m.id}
                                onClick={() => setSelectedModel(selectedModel === m.id ? null : m.id)} />
                            ))}
                            {monthCloud.length === 0 && <div className="h-[140px]" />}
                          </div>

                          {/* Divider between cloud and edge */}
                          {edgeModels.length > 0 && (
                            <div className="my-3 h-px bg-[var(--border)]" />
                          )}

                          {/* Edge cards — stack vertically */}
                          {edgeModels.length > 0 && (
                            <div className="flex flex-col gap-2">
                              {monthEdge.map((m: any) => (
                                <ModelCard key={m.id} model={m} selected={selectedModel === m.id}
                                  onClick={() => setSelectedModel(selectedModel === m.id ? null : m.id)} />
                              ))}
                              {monthEdge.length === 0 && <div className="h-[80px]" />}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════ LEADERBOARDS VIEW ══════════════ */}
          {activeView === 'leaderboards' && (
            <div className="p-5">
              {/* LLM / Embodied toggle */}
              <div className="mb-5 flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg2)] p-1 w-fit">
                {[
                  { key: 'llm',      label: 'Language Models',  icon: '🤖' },
                  { key: 'embodied', label: 'Embodied Models',   icon: '🦾' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setLbCategory(tab.key as 'llm' | 'embodied')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-medium transition-all ${
                      lbCategory === tab.key
                        ? 'bg-[var(--bg)] text-[var(--t1)] shadow-sm ring-1 ring-[var(--border)]'
                        : 'text-[var(--t3)] hover:text-[var(--t2)]'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {lbCategory === 'llm' && (
                <div className="grid grid-cols-3 gap-4">
                  <LeaderboardCard title="🖥️ SWE-bench · Coding"        items={(dbLeaderboard.swe  ?? []).slice(0, 6)} />
                  <LeaderboardCard title="📚 MMLU · Knowledge"           items={(dbLeaderboard.mmlu ?? []).slice(0, 6)} />
                  <LeaderboardCard title="⚡ Speed · tokens / sec"       items={tpsLb} />
                  <LeaderboardCard title="💰 Input Price · $/M ↓ cheap" items={priceLb} />
                  <LeaderboardCard title="📖 Context Window · K tokens"  items={ctxLb} />
                  <LeaderboardCard title="🏆 Arena ELO · Chatbot"        items={(LLM_LEADERBOARDS.arena ?? []).slice(0, 6)} />
                </div>
              )}

              {lbCategory === 'embodied' && (
                <div className="grid grid-cols-3 gap-4">
                  <LeaderboardCard title="✅ Task Success Rate · %"       items={EMBODIED_LEADERBOARDS.taskSuccess} />
                  <LeaderboardCard title="⚡ Responsiveness · latency↓"  items={EMBODIED_LEADERBOARDS.latency} />
                  <LeaderboardCard title="📡 Sensor Fusion · modalities" items={EMBODIED_LEADERBOARDS.modalities} />
                  <LeaderboardCard title="🌐 Generalization · envs"       items={EMBODIED_LEADERBOARDS.generalization} />
                  <LeaderboardCard title="📊 Deployment Scale · score"   items={EMBODIED_LEADERBOARDS.scale} />
                  <LeaderboardCard title="🤖 Autonomy Level · score"      items={EMBODIED_LEADERBOARDS.autonomy} />
                </div>
              )}
            </div>
          )}

          {/* ══════════════ LANDSCAPE VIEW ══════════════ */}
          {activeView === 'landscape' && (
            <div className="p-5">
              <div className="mb-5">
                <h2 className="text-[14px] font-bold text-[var(--t1)]">Model Landscape</h2>
                <p className="mt-0.5 text-[11px] text-[var(--t3)]">Distribution of {allModels.length} models by category and license type</p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg2)]">
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Category</th>
                      {['open', 'closed', 'partial'].map(lic => (
                        <th key={lic} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">{lic}</th>
                      ))}
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {['general', 'reasoning', 'code', 'multimodal', 'edge', 'world'].map(cat => {
                      const inCat = allModels.filter(m => m.category === cat)
                      if (inCat.length === 0) return null
                      return (
                        <tr key={cat} className="hover:bg-[var(--bg2)] transition-colors">
                          <td className="px-4 py-3 font-semibold capitalize text-[var(--t1)]">{cat}</td>
                          {['open', 'closed', 'partial'].map(lic => {
                            const ms = inCat.filter(m => (m.lic || m.license) === lic)
                            return (
                              <td key={lic} className="px-4 py-3">
                                {ms.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {ms.map(m => (
                                      <button
                                        key={m.id}
                                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] text-[var(--t1)] transition-colors hover:border-[var(--t3)] hover:bg-[var(--bg2)]"
                                        onClick={() => { setActiveView('timeline'); setSelectedModel(m.id) }}
                                      >
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: modelColor(m) }} />
                                        {m.name}
                                      </button>
                                    ))}
                                  </div>
                                ) : <span className="text-[var(--t3)]">—</span>}
                              </td>
                            )
                          })}
                          <td className="px-4 py-3 text-right font-mono font-bold text-[var(--t1)]">{inCat.length}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Company grid */}
              <div className="mt-6 grid grid-cols-4 gap-3">
                {companies.map(company => {
                  const ms    = allModels.filter(m => m.company === company)
                  const color = modelColor(ms[0])
                  const openN = ms.filter(m => (m.lic || m.license) === 'open').length
                  return (
                    <div key={company} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5 hover:shadow-sm transition-shadow"
                      style={{ borderTopColor: color, borderTopWidth: '2px' }}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[11px] font-semibold text-[var(--t1)] truncate">{company}</span>
                        <span className="ml-auto shrink-0 text-[10px] font-mono text-[var(--t3)]">{ms.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ms.map(m => (
                          <span key={m.id} className="rounded-md border border-[var(--border)] bg-[var(--bg2)] px-1.5 py-0.5 text-[9px] text-[var(--t2)]">
                            {m.name}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--bg2)]">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round(openN / ms.length * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-[9px] text-[var(--t3)]">{openN}/{ms.length} open-source</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══════════════ COMPANY ANALYSIS VIEW ══════════════ */}
          {activeView === 'company' && (
            <div className="p-5">
              <div className="mb-5">
                <h2 className="text-[14px] font-bold text-[var(--t1)]">Company Analysis</h2>
                <p className="mt-0.5 text-[11px] text-[var(--t3)]">{companies.length} AI labs tracked</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {companies.map(company => {
                  const ms         = allModels.filter(m => m.company === company)
                  const color      = modelColor(ms[0])
                  const sweScores  = ms.filter(m => m.swe).map(m => m.swe as number)
                  const avgSwe     = sweScores.length ? Math.round(sweScores.reduce((a, b) => a + b, 0) / sweScores.length) : null
                  const latest     = [...ms].filter(m => m.date).sort((a, b) => b.date.localeCompare(a.date))[0]
                  const openN      = ms.filter(m => (m.lic || m.license) === 'open').length
                  const catList    = [...new Set(ms.map(m => m.category))]
                  return (
                    <div key={company} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 hover:shadow-sm transition-shadow"
                      style={{ borderTopColor: color, borderTopWidth: '3px' }}>
                      <div className="mb-3 flex items-start gap-3">
                        <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white text-[11px] font-bold"
                          style={{ backgroundColor: color }}>
                          {company.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-bold text-[var(--t1)]">{company}</div>
                          <div className="text-[10px] text-[var(--t3)]">{catList.join(' · ')}</div>
                        </div>
                        <span className="shrink-0 text-[11px] font-mono font-semibold text-[var(--t2)]">{ms.length} models</span>
                      </div>

                      <div className="mb-3 grid grid-cols-3 gap-3">
                        {[
                          { label: 'Latest', value: latest?.name ?? '—' },
                          { label: 'Avg SWE', value: avgSwe != null ? `${avgSwe}%` : '—' },
                          { label: 'Open', value: `${openN}/${ms.length}` },
                        ].map(stat => (
                          <div key={stat.label} className="rounded-lg bg-[var(--bg2)] px-2.5 py-2">
                            <div className="text-[9px] uppercase tracking-wide text-[var(--t3)]">{stat.label}</div>
                            <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--t1)]">{stat.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg2)]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(openN / ms.length * 100)}%` }} />
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {ms.map(m => {
                          const mlic = m.lic || m.license
                          return (
                            <button
                              key={m.id}
                              onClick={() => { setActiveView('timeline'); setSelectedModel(m.id) }}
                              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:opacity-80 ${
                                mlic === 'open'    ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
                                mlic === 'partial' ? 'border-amber-200 bg-amber-50 text-amber-800' :
                                                     'border-slate-200 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {m.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* ── Right Detail Panel ─────────────────────────────────────────────── */}
        {selectedModelData && (
          <RightPanel model={selectedModelData} onClose={() => setSelectedModel(null)} />
        )}
      </div>
    </div>
  )
}
