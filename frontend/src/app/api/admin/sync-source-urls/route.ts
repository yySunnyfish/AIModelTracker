/**
 * POST /api/admin/sync-source-urls
 *
 * Batch-populates models.source_url from source_registry.ts primary[0].
 *
 * Rules:
 *  - Only updates rows where source_url IS NULL (safe by default).
 *  - Pass { force: true } in body to overwrite ALL rows, even existing ones.
 *  - Models with no registry entry are reported as "no_registry" and skipped.
 *
 * Returns:
 *  { updated, skipped, no_registry, rows: [...] }
 */

import { NextResponse } from 'next/server'
import { requireAdminAccess } from '@/lib/route_auth'
import { createServerClient } from '@/lib/supabase'
import { getModelSources } from '@/lib/source_registry'

export async function POST(request: Request) {
  const authError = requireAdminAccess(request)
  if (authError) return authError
  const body = await request.json().catch(() => ({}))
  const force: boolean = body?.force === true

  const supabase = createServerClient()

  // Fetch all non-archived models with their company name
  const { data: models, error } = await supabase
    .from('models')
    .select('id, name, source_url, company:companies(name)')
    .is('archived_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: { name: string; status: string; url: string | null }[] = []
  let updated = 0, skipped = 0, no_registry = 0

  for (const model of models ?? []) {
    const companyName = (model.company as any)?.name ?? ''
    const entry = getModelSources(model.name, companyName)

    if (!entry || !entry.primary[0]) {
      no_registry++
      rows.push({ name: model.name, status: 'no_registry', url: null })
      continue
    }

    const targetUrl = entry.primary[0]

    // Skip if already set and not forcing
    if (!force && model.source_url) {
      skipped++
      rows.push({ name: model.name, status: 'skipped (has url)', url: model.source_url })
      continue
    }

    // Skip if already correct
    if (model.source_url === targetUrl) {
      skipped++
      rows.push({ name: model.name, status: 'skipped (already correct)', url: targetUrl })
      continue
    }

    const { error: patchErr } = await supabase
      .from('models')
      .update({ source_url: targetUrl, updated_at: new Date().toISOString() })
      .eq('id', model.id)

    if (patchErr) {
      rows.push({ name: model.name, status: `error: ${patchErr.message}`, url: targetUrl })
    } else {
      updated++
      rows.push({ name: model.name, status: 'updated', url: targetUrl })
    }
  }

  return NextResponse.json({ updated, skipped, no_registry, total: (models ?? []).length, rows })
}
