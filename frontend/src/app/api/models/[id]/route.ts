import { NextResponse } from 'next/server'
import { createAnonServerClient, createServerClient } from '@/lib/supabase'
import { requireWriteAccess } from '@/lib/route_auth'
import { applyCanonicalSpecs } from '@/data/model_specs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAnonServerClient()
  const { data, error } = await supabase
    .from('models')
    .select(`
      id, name, color, category, params, context_window, license, modalities,
      innovation, architecture, release_date, source_url, updated_at,
      company:companies(name, region),
      benchmarks:model_benchmarks(score, benchmark:benchmarks(name)),
      price:price_history(input_price_per_million, output_price_per_million, effective_from)
    `)
    .eq('id', id)
    .is('archived_at', null)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireWriteAccess(request)
  if (authError) return authError
  const { id } = await params
  const rawBody = await request.json()

  // Apply canonical specs override for known models (params/ctx/license can't be overwritten by LLM extraction)
  const body = rawBody.name ? applyCanonicalSpecs(rawBody) : rawBody

  const allowed = ['name', 'params', 'context_window', 'license', 'innovation',
    'architecture', 'source_url', 'modalities', 'category', 'release_date']

  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('models')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If new price provided, upsert into price_history (unique constraint on model_id+effective_from)
  if (body.inputPrice !== undefined && body.outputPrice !== undefined) {
    await supabase.from('price_history').upsert(
      {
        model_id: id,
        input_price_per_million: body.inputPrice,
        output_price_per_million: body.outputPrice,
        effective_from: new Date().toISOString().slice(0, 10),
        source: 'manual',
      },
      { onConflict: 'model_id,effective_from' },
    )
  }

  return NextResponse.json({ success: true, data })
}
