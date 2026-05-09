/**
 * Benchmark seeder — ensures the `benchmarks` reference table has standard
 * entries for all well-known benchmarks that we extract scores for.
 *
 * Called lazily during batch-ingest; idempotent (upsert by name).
 */

import { createServerClient } from '@/lib/supabase'

/** Canonical benchmark definitions */
const STANDARD_BENCHMARKS = [
  { name: 'SWE-bench',  unit: '%',  description: 'Software engineering tasks (verified)' },
  { name: 'MMLU',       unit: '%',  description: 'Massive Multitask Language Understanding' },
  { name: 'MATH',       unit: '%',  description: 'Competition mathematics' },
  { name: 'Arena ELO',  unit: 'elo',description: 'Chatbot Arena Elo rating' },
  { name: 'HumanEval',  unit: '%',  description: 'Python code generation pass@1' },
  { name: 'GPQA',       unit: '%',  description: 'Graduate-level google-proof Q&A' },
  { name: 'AIME',       unit: '%',  description: 'American Invitational Mathematics Exam' },
  { name: 'GSM8K',      unit: '%',  description: 'Grade-school math word problems' },
  { name: 'BBH',        unit: '%',  description: 'BIG-Bench Hard' },
  { name: 'HellaSwag',  unit: '%',  description: 'Commonsense NLI' },
  { name: 'ARC',        unit: '%',  description: 'AI2 Reasoning Challenge' },
  { name: 'TruthfulQA', unit: '%',  description: 'Truthfulness evaluation' },
  { name: 'LiveBench',  unit: 'score', description: 'Live benchmark (contamination-free)' },
  { name: 'AA Quality', unit: 'score', description: 'Artificial Analysis intelligence index (0-100)' },
  { name: 'TPS',        unit: 'tok/s', description: 'Tokens per second (throughput)' },
]

// Module-level cache: name → id
let _benchmarkIdCache: Map<string, string> | null = null
let _cacheLoadedAt = 0
const CACHE_TTL_MS = 10 * 60 * 1000  // 10 min

export async function getBenchmarkIdMap(): Promise<Map<string, string>> {
  if (_benchmarkIdCache && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) {
    return _benchmarkIdCache
  }

  const supabase = createServerClient()

  // Seed missing standard benchmarks
  for (const bm of STANDARD_BENCHMARKS) {
    await supabase
      .from('benchmarks')
      .upsert({ name: bm.name, unit: bm.unit, description: bm.description },
               { onConflict: 'name', ignoreDuplicates: true })
  }

  // Fetch full list
  const { data } = await supabase.from('benchmarks').select('id, name')

  const map = new Map<string, string>()
  for (const b of data ?? []) {
    map.set(b.name.toLowerCase(), b.id)
  }

  _benchmarkIdCache = map
  _cacheLoadedAt = Date.now()
  return map
}
