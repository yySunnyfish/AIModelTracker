'use client'

import { useState, useMemo } from 'react'
import { GPUS, PRECISIONS, calcDeploy } from '@/data/hardware'
import { LLM_MODELS, EMBODIED_MODELS } from '@/data/static'

// ── helpers ──────────────────────────────────────────────────────────────────

function parseParamsB(raw: string | undefined): { total: number; active: number } {
  if (!raw) return { total: 0, active: 0 }
  const clean = raw.replace(/\s/g, '')
  const toB = (s: string) => {
    const n = parseFloat(s)
    return s.toUpperCase().endsWith('T') ? n * 1000 : n
  }
  const m = clean.match(/^(.+?)-A(.+)$/i)
  return m ? { total: toB(m[1]), active: toB(m[2]) } : { total: toB(clean), active: toB(clean) }
}

function fmt(n: number, digits = 1) {
  if (!isFinite(n) || n <= 0) return '—'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toFixed(digits)
}

function fmtGB(n: number) {
  return n < 1 ? `${(n * 1024).toFixed(0)} MB` : `${n.toFixed(1)} GB`
}

const TP_OPTIONS = [1, 2, 4, 8, 16]

const ALL_MODELS = [...LLM_MODELS, ...EMBODIED_MODELS].filter(m => m.params && m.params !== '—')

// ── components ────────────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number
  unit?: string; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--t2)]">{label}</span>
        <span className="text-[11px] font-mono font-semibold text-[var(--t1)]">
          {value.toLocaleString()}{unit ?? ''}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#185FA5]"
      />
    </div>
  )
}

function MetricTile({
  label, value, sub, color, big = false,
}: { label: string; value: string; sub?: string; color?: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wide text-[var(--t3)]">{label}</div>
      <div
        className={`mt-0.5 font-semibold leading-tight ${big ? 'text-[15px]' : 'text-[13px]'}`}
        style={{ color: color ?? 'var(--t1)' }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[9px] text-[var(--t3)]">{sub}</div>}
    </div>
  )
}

function VRAMBar({ label, bytes, total, color }: { label: string; bytes: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (bytes / total) * 100) : 0
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-[var(--t2)]">{label}</span>
        <span className="font-mono text-[var(--t2)]">{fmtGB(bytes)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-[var(--border)]">
        <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DeployPage() {
  const [activeParamsB, setActiveParamsB] = useState(7)
  const [totalParamsB,  setTotalParamsB]  = useState(7)
  const [isMoE,         setIsMoE]         = useState(false)
  const [precisionId,   setPrecisionId]   = useState('fp16')
  const [gpuId,         setGpuId]         = useState('h100-sxm')
  const [numGPUs,       setNumGPUs]       = useState(1)
  const [ctxLen,        setCtxLen]        = useState(4096)
  const [concurrency,   setConcurrency]   = useState(8)
  const [tpEff,         setTpEff]         = useState(85)
  const [preset,        setPreset]        = useState('')

  const gpu       = GPUS.find(g => g.id === gpuId)       ?? GPUS[0]
  const precision = PRECISIONS.find(p => p.id === precisionId) ?? PRECISIONS[0]

  function applyPreset(name: string) {
    const m = ALL_MODELS.find(m => m.name === name)
    if (!m) return
    const { total, active } = parseParamsB(m.params)
    setTotalParamsB(total || 7)
    setActiveParamsB(active || 7)
    setIsMoE(total !== active && total > 0)
    setPreset(name)
  }

  const result = useMemo(() => calcDeploy({
    activeParamsB,
    totalParamsB: isMoE ? totalParamsB : activeParamsB,
    bytesPerParam: precision.bytes,
    ctxLen,
    concurrency,
    gpu,
    numGPUs,
    tpEfficiency: tpEff / 100,
  }), [activeParamsB, totalParamsB, isMoE, precision, ctxLen, concurrency, gpu, numGPUs, tpEff])

  // Does the model fit within numGPUs × gpu.vram?
  const totalAvailVRAM = numGPUs * gpu.vram
  const vramFitOK = result.totalVRAM_GB <= totalAvailVRAM

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--t1)]">
      {/* Nav */}
      <div className="flex items-center gap-4 border-b border-[var(--border)] px-6 py-3">
        <a href="/" className="text-[11px] text-[var(--t3)] hover:text-[var(--t1)]">← ModelTrack</a>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-semibold text-[var(--t1)]">Deployment Cost Estimator</span>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-[var(--t1)]">部署方案 &amp; 推理成本估算</h1>
          <p className="mt-1 text-[11px] text-[var(--t3)]">
            基于 Roofline 模型计算 LLM 在不同硬件配置下的 VRAM 需求、TPS 上限及每百万 Token 成本
          </p>
        </div>

        <div className="flex gap-6">

          {/* ── LEFT: inputs (sticky, scrollable) ────────────────── */}
          <div className="w-72 shrink-0 space-y-4 self-start sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">

            {/* Preset */}
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">快速选择模型</div>
              <select
                value={preset}
                onChange={e => applyPreset(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg2)] px-2 py-1.5 text-[11px] text-[var(--t1)]"
              >
                <option value="">— 手动输入 —</option>
                {ALL_MODELS.map(m => (
                  <option key={m.id} value={m.name}>{m.name} ({m.params})</option>
                ))}
              </select>
            </div>

            {/* Model params */}
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg2)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">模型规模</div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--t2)]">
                <input type="checkbox" checked={isMoE} onChange={e => setIsMoE(e.target.checked)} className="accent-[#185FA5]" />
                MoE 架构（有效参数 vs 总参数）
              </label>
              <Slider
                label={isMoE ? 'Active Params (B)' : 'Parameters (B)'}
                value={activeParamsB} min={1} max={700} step={1}
                unit=" B" onChange={setActiveParamsB}
              />
              {isMoE && (
                <Slider
                  label="Total Params (B)" value={totalParamsB}
                  min={activeParamsB} max={2000} step={1}
                  unit=" B" onChange={setTotalParamsB}
                />
              )}
            </div>

            {/* Precision */}
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">量化精度</div>
              <div className="grid grid-cols-3 gap-1.5">
                {PRECISIONS.map(p => (
                  <button key={p.id}
                    onClick={() => setPrecisionId(p.id)}
                    className={`rounded border px-2 py-1.5 text-center text-[10px] font-medium transition-colors ${
                      precisionId === p.id
                        ? 'border-[#185FA5] bg-[#185FA5] text-white'
                        : 'border-[var(--border)] bg-[var(--bg2)] text-[var(--t2)] hover:border-[#185FA5]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-[var(--t3)]">{precision.note} — {precision.bytes} byte/param</div>
            </div>

            {/* GPU selector */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">芯片选型</div>
              {GPUS.map(g => (
                <button key={g.id}
                  onClick={() => setGpuId(g.id)}
                  className={`w-full rounded border px-2.5 py-1.5 text-left text-[10px] transition-colors ${
                    gpuId === g.id
                      ? 'border-[#185FA5] text-[#185FA5]'
                      : 'border-[var(--border)] bg-[var(--bg2)] text-[var(--t2)] hover:border-[var(--t3)]'
                  }`}
                  style={gpuId === g.id ? { backgroundColor: '#185FA510' } : undefined}
                >
                  <div className="font-semibold">{g.name}</div>
                  <div className="mt-0.5 text-[9px] opacity-70">{g.vram}GB · {g.bw} GB/s · ${g.pricePerHr}/hr</div>
                </button>
              ))}
            </div>

            {/* TP degree */}
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">张量并行度 (TP)</div>
              <div className="grid grid-cols-5 gap-1">
                {TP_OPTIONS.map(n => (
                  <button key={n}
                    onClick={() => setNumGPUs(n)}
                    className={`rounded border py-1.5 text-center text-[10px] font-mono font-semibold transition-colors ${
                      numGPUs === n
                        ? 'border-[#185FA5] bg-[#185FA5] text-white'
                        : 'border-[var(--border)] bg-[var(--bg2)] text-[var(--t2)]'
                    }`}
                  >
                    {n}×
                  </button>
                ))}
              </div>
              <Slider label="互联效率 (%)" value={tpEff} min={40} max={100} step={5} unit="%" onChange={setTpEff} />
              <div className="text-[9px] text-[var(--t3)]">NVLink ≈85% · InfiniBand ≈75% · PCIe ≈65%</div>
            </div>

            {/* Workload */}
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg2)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">负载设定</div>
              <Slider label="上下文长度 (tokens)" value={ctxLen} min={512} max={128000} step={512} onChange={setCtxLen} />
              <Slider label="并发请求数" value={concurrency} min={1} max={256} step={1} onChange={setConcurrency} />
            </div>
          </div>

          {/* ── RIGHT: results ───────────────────────────────────────── */}
          <div className="min-w-0 flex-1 space-y-4">

            {/* VRAM breakdown */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--t3)]">显存分析</div>
                <div className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                  vramFitOK ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {vramFitOK
                    ? `✓ 可装入 ${numGPUs}× ${gpu.name} (${totalAvailVRAM} GB)`
                    : `✗ 需要 ${result.minGPUs}× ${gpu.name} — 当前不足`}
                </div>
              </div>
              <div className="space-y-2.5">
                <VRAMBar label="模型权重"       bytes={result.weightVRAM_GB} total={result.totalVRAM_GB} color="#185FA5" />
                <VRAMBar
                  label={`KV Cache (${concurrency}req × ${ctxLen.toLocaleString()}tok)`}
                  bytes={result.kvVRAM_GB} total={result.totalVRAM_GB} color="#D97706"
                />
                <VRAMBar
                  label="激活 & 框架开销 (10%)"
                  bytes={result.totalVRAM_GB - result.weightVRAM_GB - result.kvVRAM_GB}
                  total={result.totalVRAM_GB} color="#9CA3AF"
                />
                <div className="flex justify-between border-t border-[var(--border)] pt-2 text-[11px] font-semibold">
                  <span className="text-[var(--t2)]">Total VRAM needed</span>
                  <span style={{ color: vramFitOK ? '#1D9E75' : '#E24B4A' }}>
                    {fmtGB(result.totalVRAM_GB)} / {totalAvailVRAM} GB ({numGPUs}× {gpu.vram} GB)
                  </span>
                </div>
              </div>
            </div>

            {/* TPS */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--t3)]">推理速度 (Roofline)</div>
              <div className="grid grid-cols-3 gap-3">
                <MetricTile
                  label="单请求 TPS (BW-bound)"
                  value={`${fmt(result.tpsBandwidthBound)} t/s`}
                  sub={`${fmt(result.effectiveBW_GBs / 1000, 2)} TB/s ÷ ${fmtGB(result.weightVRAM_GB / numGPUs)}/GPU`}
                  color="#185FA5" big
                />
                <MetricTile
                  label={`系统吞吐 ×${concurrency} 并发`}
                  value={`${fmt(result.throughputTokensPerSec)} t/s`}
                  sub={concurrency >= result.computeBoundBatch
                    ? `算力上限 (batch ≥ ${result.computeBoundBatch})`
                    : `BW 线性扩展 (batch < ${result.computeBoundBatch})`}
                  color="#7C3AED" big
                />
                <MetricTile
                  label="算力上限 TPS (Compute-bound)"
                  value={`${fmt(result.tpsComputeBound)} t/s`}
                  sub={`${numGPUs}× ${gpu.tflops} TFLOPS ÷ 2×${activeParamsB}B`}
                  color="#1D9E75"
                />
              </div>
              <div className="mt-3 rounded bg-[var(--bg2)] p-2.5 text-[10px] text-[var(--t3)]">
                <span className="font-semibold text-[var(--t2)]">Roofline 转折点：</span>
                {' '}batch ≥{' '}
                <span className="font-mono font-semibold text-[var(--t1)]">{result.computeBoundBatch}</span>
                {' '}时切换为算力瓶颈。TPS 上限 {fmt(result.tpsComputeBound)} t/s，BW 侧单请求 {fmt(result.tpsBandwidthBound)} t/s。
              </div>
            </div>

            {/* Cost */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--t3)]">推理成本</div>
              <div className="grid grid-cols-4 gap-3">
                <MetricTile
                  label="GPU 租用 /hr"
                  value={`$${result.gpuCostPerHr.toFixed(2)}`}
                  sub={`${numGPUs}× ${gpu.name}`}
                  color="#E24B4A" big
                />
                <MetricTile
                  label="输出 Token $/MTok"
                  value={isFinite(result.costPerMTok) ? `$${result.costPerMTok.toFixed(3)}` : '—'}
                  sub="per million output tokens"
                  color="#E24B4A" big
                />
                <MetricTile
                  label="输入 Token $/MTok"
                  value={isFinite(result.costPerMTokInput) ? `$${result.costPerMTokInput.toFixed(4)}` : '—'}
                  sub="prefill，约 1/5 输出成本"
                  color="#D97706"
                />
                <MetricTile
                  label="每小时 token 产出"
                  value={`${fmt(result.throughputTokensPerSec * 3600 / 1e6, 1)}M`}
                  sub="output tokens / hr"
                />
              </div>
            </div>

            {/* Formula */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg2)] p-4 text-[10px]">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">核心公式</div>
              <div className="space-y-1 font-mono text-[var(--t2)]">
                <div><span className="text-[var(--t3)]">Weight VRAM  = </span>P_total × bytes/param</div>
                <div><span className="text-[var(--t3)]">KV Cache     = </span>2 × L × d_model × ctx_len × bytes × N_req</div>
                <div><span className="text-[var(--t3)]">BW-TPS       = </span>BW_eff / (P_active × bytes/param)</div>
                <div><span className="text-[var(--t3)]">Compute-TPS  = </span>N_GPU × TFLOPS / (2 × P_active)</div>
                <div><span className="text-[var(--t3)]">Cost/MTok    = </span>(N_GPU × $/hr) / (TPS × 3600 / 10⁶)</div>
              </div>
              <div className="mt-2.5 space-y-1 text-[9px] text-[var(--t3)]">
                <div>• <b>BW-bound</b>：小 batch 解码阶段，每 token 读一遍全部权重；MoE 用 P_total 算 VRAM，P_active 算 BW-TPS</div>
                <div>• <b>Compute-bound</b>：大 batch prefill，受 TFLOPS 限制；转折 batch = TFLOPS×10³ / BW / bytes</div>
                <div>• L ≈ 4·∛(P×10³)，d_model ≈ 128·∛(P×10³)（scaling law 近似，无需架构参数）</div>
              </div>
            </div>

            {/* Chip comparison table */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--t3)]">芯片横向对比（当前配置）</div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[9px] text-[var(--t3)]">
                    <th className="pb-1.5 pr-3 font-medium">芯片</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">VRAM</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Min GPU</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">BW-TPS</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">$/MTok out</th>
                    <th className="pb-1.5 text-right font-medium">$/hr</th>
                  </tr>
                </thead>
                <tbody>
                  {GPUS.map(g => {
                    const rawMin = ((isMoE ? totalParamsB : activeParamsB) * precision.bytes * 1.1) / g.vram
                    const minN   = rawMin <= 1 ? 1 : Math.pow(2, Math.ceil(Math.log2(rawMin)))
                    const r = calcDeploy({
                      activeParamsB,
                      totalParamsB: isMoE ? totalParamsB : activeParamsB,
                      bytesPerParam: precision.bytes,
                      ctxLen,
                      concurrency,
                      gpu: g,
                      numGPUs: minN,
                      tpEfficiency: tpEff / 100,
                    })
                    const isActive = g.id === gpuId
                    return (
                      <tr
                        key={g.id}
                        onClick={() => { setGpuId(g.id); setNumGPUs(minN) }}
                        className="cursor-pointer border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--bg2)]"
                        style={isActive ? { backgroundColor: '#185FA510' } : undefined}
                      >
                        <td className={`py-1.5 pr-3 font-semibold ${isActive ? 'text-[#185FA5]' : 'text-[var(--t1)]'}`}>
                          {g.name}
                          {isActive && <span className="ml-1 text-[8px] opacity-60">← selected</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-[var(--t2)]">{g.vram} GB</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-[var(--t2)]">{minN}×</td>
                        <td className="py-1.5 pr-3 text-right font-mono font-semibold text-[var(--t1)]">
                          {fmt(r.tpsBandwidthBound)} t/s
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono" style={{ color: '#E24B4A' }}>
                          {isFinite(r.costPerMTok) ? `$${r.costPerMTok.toFixed(3)}` : '—'}
                        </td>
                        <td className="py-1.5 text-right font-mono text-[var(--t2)]">
                          ${(minN * g.pricePerHr).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </main>
  )
}
