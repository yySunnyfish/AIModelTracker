/**
 * POST /api/admin/seed-static-data
 *
 * Seeds model_capability_scores and model_rich_profiles from the static
 * MODEL_SCORES and MODEL_PROFILES data files.
 *
 * Only inserts rows where the model exists in the DB and the table row
 * is missing (source = 'manual' or no row). Existing rows with source
 * = 'llm_extracted' or 'auto_derived' are NOT overwritten.
 *
 * Use ?force=true to overwrite all existing rows regardless of source.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { MODEL_SCORES } from '@/data/model_scores'
import { MODEL_PROFILES } from '@/data/model_profiles'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

  const supabase = createServerClient()

  // Fetch all model ids+names from DB
  const { data: models, error: modelsErr } = await supabase
    .from('models')
    .select('id, name')
    .is('archived_at', null)

  if (modelsErr || !models) {
    return NextResponse.json({ error: modelsErr?.message ?? 'Failed to load models' }, { status: 500 })
  }

  const modelMap = new Map<string, string>(models.map(m => [m.name, m.id]))

  // ── Seed model_capability_scores ──────────────────────────────────────────

  const scoreRows = Object.entries(MODEL_SCORES)
    .filter(([name]) => modelMap.has(name))
    .map(([name, scores]) => ({
      model_id:     modelMap.get(name)!,
      coding:       scores.coding       ?? null,
      agentic:      scores.agentic      ?? null,
      multimodal:   scores.multimodal   ?? null,
      reasoning:    scores.reasoning    ?? null,
      math:         scores.math         ?? null,
      hallucination:scores.hallucination ?? null,
      source:       'manual',
      updated_at:   new Date().toISOString(),
    }))

  let scoreInserted = 0
  let scoreSkipped  = 0

  for (const row of scoreRows) {
    if (!force) {
      // Check if a non-manual row already exists
      const { data: existing } = await supabase
        .from('model_capability_scores')
        .select('source')
        .eq('model_id', row.model_id)
        .maybeSingle()
      if (existing && existing.source !== 'manual') {
        scoreSkipped++
        continue
      }
    }
    const { error } = await supabase
      .from('model_capability_scores')
      .upsert(row, { onConflict: 'model_id' })
    if (error) {
      console.error('seed cap_scores:', row.model_id, error.message)
    } else {
      scoreInserted++
    }
  }

  // ── Seed model_rich_profiles ──────────────────────────────────────────────

  const profileRows = Object.values(MODEL_PROFILES)
    .filter(p => modelMap.has(p.name))
    .map(p => ({
      model_id:       modelMap.get(p.name)!,
      capabilities:   p.capabilities ?? [],
      applications:   p.applications ?? [],
      impact_tags:    p.impact?.tags ?? [],
      impact_summary: p.impact?.summary ?? null,
      source:         'manual',
      updated_at:     new Date().toISOString(),
    }))

  let profileInserted = 0
  let profileSkipped  = 0

  for (const row of profileRows) {
    if (!force) {
      const { data: existing } = await supabase
        .from('model_rich_profiles')
        .select('source')
        .eq('model_id', row.model_id)
        .maybeSingle()
      if (existing && existing.source !== 'manual') {
        profileSkipped++
        continue
      }
    }
    const { error } = await supabase
      .from('model_rich_profiles')
      .upsert(row, { onConflict: 'model_id' })
    if (error) {
      console.error('seed rich_profiles:', row.model_id, error.message)
    } else {
      profileInserted++
    }
  }

  return NextResponse.json({
    scores:   { inserted: scoreInserted,   skipped: scoreSkipped,   total: scoreRows.length },
    profiles: { inserted: profileInserted, skipped: profileSkipped, total: profileRows.length },
    models_in_db: models.length,
  })
}
