/**
 * POST /api/admin/repair-benchmarks
 *
 * Overwrites model_benchmarks in the DB using model_scores.ts as ground truth.
 * Safe to call repeatedly — upserts by (model_id, benchmark_id).
 *
 * Mapping:
 *   coding       → SWE-bench
 *   reasoning    → MMLU
 *   math         → MATH-500
 *
 * Returns a summary of rows upserted / skipped.
 */

import { NextResponse } from 'next/server'
import { requireAdminAccess } from '@/lib/route_auth'
import { createServerClient } from '@/lib/supabase'
import { MODEL_SCORES } from '@/data/model_scores'

const DIM_TO_BENCHMARK: Record<string, string> = {
  coding:    'SWE-bench',
  reasoning: 'MMLU',
  math:      'MATH',
}

export async function POST(request: Request) {
  const authError = await requireAdminAccess(request)
  if (authError) return authError
  const supabase = createServerClient()

  // Fetch all models from DB
  const { data: dbModels, error: mErr } = await supabase
    .from('models')
    .select('id, name')

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  // Fetch all benchmarks to build name→id map
  const { data: benchmarkDefs, error: bErr } = await supabase
    .from('benchmarks')
    .select('id, name')

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const benchmarkIdByName = new Map<string, string>()
  for (const b of benchmarkDefs ?? []) {
    benchmarkIdByName.set(b.name.toLowerCase(), b.id)
  }

  const today = new Date().toISOString().slice(0, 10)
  let upserted = 0
  let skipped = 0
  const missing: string[] = []

  for (const model of dbModels ?? []) {
    const scores = MODEL_SCORES[model.name]
    if (!scores) { skipped++; continue }

    for (const [dim, bmName] of Object.entries(DIM_TO_BENCHMARK)) {
      const score = (scores as any)[dim]
      if (score == null || score === 0) continue

      const benchmarkId = benchmarkIdByName.get(bmName.toLowerCase())
      if (!benchmarkId) { missing.push(bmName); continue }

      await supabase.from('model_benchmarks').upsert(
        {
          model_id:         model.id,
          benchmark_id:     benchmarkId,
          score,
          source:           'official',
          tested_at:        today,
          confidence_score: 1.0,
        },
        { onConflict: 'model_id,benchmark_id,tested_at,source' }
      )
      upserted++
    }
  }

  return NextResponse.json({
    ok: true,
    upserted,
    skipped,
    missingBenchmarks: [...new Set(missing)],
  })
}
