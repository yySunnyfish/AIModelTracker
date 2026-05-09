/**
 * GPU / Accelerator specs for LLM inference cost estimation
 * BF16 peak TFLOPS, HBM bandwidth (GB/s), VRAM (GB), on-demand cloud price ($/hr)
 */

export interface GPU {
  id: string
  name: string
  vram: number        // GB
  bw: number          // Memory bandwidth GB/s
  tflops: number      // BF16 dense TFLOPS
  pricePerHr: number  // USD/hr (on-demand, single GPU)
  vendor: 'NVIDIA' | 'AMD' | 'Google' | 'Cerebras'
  note?: string
}

export const GPUS: GPU[] = [
  { id: 'h100-sxm', name: 'H100 SXM',    vram: 80,  bw: 3350, tflops: 989,  pricePerHr: 3.50, vendor: 'NVIDIA', note: 'HBM3, NVLink 900 GB/s' },
  { id: 'h100-pcie',name: 'H100 PCIe',   vram: 80,  bw: 2000, tflops: 756,  pricePerHr: 2.80, vendor: 'NVIDIA' },
  { id: 'h200-sxm', name: 'H200 SXM',    vram: 141, bw: 4800, tflops: 989,  pricePerHr: 5.50, vendor: 'NVIDIA', note: 'HBM3e, 4.8 TB/s' },
  { id: 'a100-sxm', name: 'A100 SXM',    vram: 80,  bw: 2000, tflops: 312,  pricePerHr: 2.00, vendor: 'NVIDIA' },
  { id: 'a100-pcie',name: 'A100 PCIe',   vram: 80,  bw: 1935, tflops: 312,  pricePerHr: 1.80, vendor: 'NVIDIA' },
  { id: 'l40s',     name: 'L40S',         vram: 48,  bw: 864,  tflops: 362,  pricePerHr: 1.50, vendor: 'NVIDIA' },
  { id: 'rtx4090',  name: 'RTX 4090',     vram: 24,  bw: 1008, tflops: 165,  pricePerHr: 0.80, vendor: 'NVIDIA', note: 'GDDR6X, prosumer' },
  { id: 'mi300x',   name: 'MI300X',       vram: 192, bw: 5300, tflops: 1307, pricePerHr: 4.50, vendor: 'AMD',    note: 'HBM3, 192 GB' },
  { id: 'mi250x',   name: 'MI250X',       vram: 128, bw: 3200, tflops: 383,  pricePerHr: 2.20, vendor: 'AMD' },
]

export const PRECISIONS: { id: string; label: string; bytes: number; note: string }[] = [
  { id: 'fp16',  label: 'FP16',  bytes: 2,   note: '标准推理精度' },
  { id: 'bf16',  label: 'BF16',  bytes: 2,   note: '训练/推理首选' },
  { id: 'fp8',   label: 'FP8',   bytes: 1,   note: 'H100/H200 原生支持' },
  { id: 'int8',  label: 'INT8',  bytes: 1,   note: '量化，精度轻微损失' },
  { id: 'int4',  label: 'INT4',  bytes: 0.5, note: '激进量化，约 3% 精度损失' },
]

/**
 * Deployment estimation formula
 *
 * @param activeParamsB   - Active parameters in billions (use total for dense, active for MoE)
 * @param totalParamsB    - Total parameters in billions (MoE: all expert weights loaded to VRAM)
 * @param bytesPerParam   - Bytes per weight from PRECISIONS
 * @param ctxLen          - Max context tokens per request
 * @param concurrency     - Max concurrent requests
 * @param gpu             - GPU spec
 * @param numGPUs         - Tensor-parallel degree
 * @param tpEfficiency    - Tensor-parallel collective efficiency (0.85 for NVLink, 0.7 for PCIe)
 */
export interface DeployConfig {
  activeParamsB: number
  totalParamsB: number
  bytesPerParam: number
  ctxLen: number
  concurrency: number
  gpu: GPU
  numGPUs: number
  tpEfficiency: number
}

export interface DeployResult {
  weightVRAM_GB: number      // Model weight memory
  kvVRAM_GB: number          // KV cache for all concurrent requests
  totalVRAM_GB: number       // weight + kv + 10% overhead
  minGPUs: number            // minimum to fit in VRAM
  effectiveBW_GBs: number    // aggregate bandwidth with TP efficiency
  // Memory-bandwidth-bound TPS (batch=1, single request)
  tpsBandwidthBound: number
  // Compute-bound max TPS (large batch limit)
  tpsComputeBound: number
  // Batch size where compute bound kicks in
  computeBoundBatch: number
  // Throughput for given concurrency
  throughputTokensPerSec: number
  // Cost metrics
  gpuCostPerHr: number
  costPerMTok: number        // USD per million output tokens
  costPerMTokInput: number   // USD per million input tokens (prefill phase, ~3× cheaper)
}

// Approximate KV cache bytes per token for a model of activeParamsB size
// Rule: d_model ≈ 128 * cbrt(activeParamsB * 1000) * 10 ≈ rough architectural estimate
// KV bytes/token ≈ 2 * num_layers * d_model * bytes_kv
// Empirically: ~2 MB/token/1K for 7B (FP16), scales roughly linearly with params
// Simplified: kv_bytes_per_token_fp16 ≈ activeParamsB * 0.285 * 1024 (bytes per token, FP16)
// → for 7B: 7 * 0.285 * 1024 ≈ 2042 bytes/token ≈ 2 KB (matches empirical)
function kvBytesPerToken(activeParamsB: number, bytesPerKV: number): number {
  // Scale: num_layers ≈ 4 * cbrt(activeParamsB * 1000), d_model ≈ 128 * cbrt(activeParamsB * 1000)
  const scale = Math.cbrt(activeParamsB * 1000)
  const numLayers = Math.round(4 * scale)
  const dModel = Math.round(128 * scale)
  return 2 * numLayers * dModel * bytesPerKV
}

export function calcDeploy(cfg: DeployConfig): DeployResult {
  const { activeParamsB, totalParamsB, bytesPerParam, ctxLen, concurrency, gpu, numGPUs, tpEfficiency } = cfg

  // 1. Weight VRAM — for MoE, ALL expert weights must be loaded (GPU holds 1/numGPUs slice)
  const weightVRAM_GB = totalParamsB * bytesPerParam  // total across all GPUs
  const weightVRAM_perGPU = weightVRAM_GB / numGPUs

  // 2. KV cache VRAM
  const kvBytesPerTok = kvBytesPerToken(activeParamsB, bytesPerParam)
  const kvPerRequest_GB = (kvBytesPerTok * ctxLen) / 1e9
  const kvVRAM_GB = kvPerRequest_GB * concurrency / numGPUs // each GPU holds 1/numGPUs of KV

  // 3. Total VRAM per GPU with 10% activation / framework overhead
  const totalVRAM_perGPU = (weightVRAM_perGPU + kvVRAM_GB) * 1.10
  const totalVRAM_GB = totalVRAM_perGPU * numGPUs

  // 4. Minimum GPUs to fit
  const rawMin = (weightVRAM_GB * 1.10) / gpu.vram
  const minGPUs = Math.pow(2, Math.ceil(Math.log2(Math.max(1, rawMin))))

  // 5. Effective aggregate bandwidth
  const effectiveBW_GBs = numGPUs * gpu.bw * tpEfficiency

  // 6. Memory-bandwidth-bound TPS (decode phase, batch=1)
  // Each new token requires reading all active weights once from VRAM
  // TPS = BW / (activeParams_bytes_per_GPU * numGPUs) = effective_BW / activeWeight_bytes
  const activeWeightBytes = activeParamsB * 1e9 * bytesPerParam
  const tpsBandwidthBound = (effectiveBW_GBs * 1e9) / activeWeightBytes

  // 7. Compute-bound TPS (prefill / large batch)
  // Each token: 2 * activeParams FLOPs (matmul forward)
  const tpsComputeBound = (numGPUs * gpu.tflops * 1e12) / (2 * activeParamsB * 1e9)

  // 8. Batch size at which compute becomes the bottleneck
  // bandwidth_bound_throughput = compute_bound_throughput when:
  // BW / (active_bytes/GPU) = compute / (2*active)   →  batch = compute_TFLOPS / BW_GB * bytes_per_param
  const computeBoundBatch = Math.round((gpu.tflops * 1e3) / (gpu.bw * bytesPerParam))

  // 9. Realistic throughput for given concurrency (decode phase dominates latency)
  // If concurrency < computeBoundBatch: throughput ≈ batch * tpsBandwidthBound
  // If concurrency >= computeBoundBatch: throughput ≈ tpsComputeBound
  const throughputTokensPerSec = concurrency < computeBoundBatch
    ? concurrency * tpsBandwidthBound
    : tpsComputeBound

  // 10. Cost
  const gpuCostPerHr = numGPUs * gpu.pricePerHr
  // Output tokens: full decode cost
  const costPerMTok = throughputTokensPerSec > 0
    ? (gpuCostPerHr / 3600) / (throughputTokensPerSec / 1e6)
    : Infinity
  // Input tokens (prefill) ~4-8× cheaper per token (compute bound, fast)
  const costPerMTokInput = costPerMTok / 5

  return {
    weightVRAM_GB,
    kvVRAM_GB: kvVRAM_GB * numGPUs,  // total
    totalVRAM_GB,
    minGPUs,
    effectiveBW_GBs,
    tpsBandwidthBound,
    tpsComputeBound,
    computeBoundBatch,
    throughputTokensPerSec,
    gpuCostPerHr,
    costPerMTok,
    costPerMTokInput,
  }
}
