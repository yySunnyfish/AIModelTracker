/**
 * POST /api/admin/repair-specs
 *
 * Batch-repairs models.params, models.context_window, models.license in the DB
 * using MODEL_SPECS as ground truth. Safe to call repeatedly (idempotent).
 *
 * Returns: { ok, updated, skipped, modelsMissing }
 *   updated       = count of rows actually changed (at least one field differed)
 *   skipped       = rows with no canonical spec entry
 *   modelsMissing = model names in DB that have no entry in MODEL_SPECS
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { MODEL_SPECS } from '@/data/model_specs'

export async function POST() {
  const supabase = createServerClient()

  const { data: dbModels, error } = await supabase
    .from('models')
    .select('id, name, params, context_window, license')
    .is('archived_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  let skipped = 0
  const modelsMissing: string[] = []

  for (const model of dbModels ?? []) {
    const spec = MODEL_SPECS[model.name]
    if (!spec) {
      skipped++
      modelsMissing.push(model.name)
      continue
    }

    // Build update payload — only fields defined in the spec
    const patch: Record<string, string> = {}
    if (spec.params !== undefined && spec.params !== model.params)
      patch.params = spec.params
    if (spec.context_window !== undefined && spec.context_window !== model.context_window)
      patch.context_window = spec.context_window
    if (spec.license !== undefined && spec.license !== model.license)
      patch.license = spec.license

    if (Object.keys(patch).length === 0) continue  // already correct, skip

    patch.updated_at = new Date().toISOString()

    const { error: uErr } = await supabase
      .from('models')
      .update(patch)
      .eq('id', model.id)

    if (uErr) {
      console.error(`[repair-specs] failed to update ${model.name}:`, uErr.message)
    } else {
      updated++
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    modelsMissing: [...new Set(modelsMissing)],
  })
}
