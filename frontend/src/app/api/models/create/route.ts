import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { ExtractedModel } from '@/lib/extractor'
import { MODEL_SCORES } from '@/data/model_scores'
import { applyCanonicalSpecs } from '@/data/model_specs'

export async function POST(request: Request) {
  const raw: ExtractedModel = await request.json()
  // Ground truth override: canonical specs win over LLM extraction
  const body = applyCanonicalSpecs(raw)
  const supabase = createServerClient()

  // 1. Find or create company
  let companyId: string | null = null
  if (body.company) {
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', body.company.trim())
      .single()

    if (existing) {
      companyId = existing.id
    } else {
      const { data: created, error: cErr } = await supabase
        .from('companies')
        .insert({ name: body.company.trim(), region: 'OTHER', type: 'LLM' })
        .select('id')
        .single()
      if (cErr) return NextResponse.json({ error: `Company create failed: ${cErr.message}` }, { status: 500 })
      companyId = created.id
    }
  }

  // 2. Insert model
  const { data: model, error: mErr } = await supabase
    .from('models')
    .insert({
      company_id: companyId,
      name: body.name ?? 'Unknown',
      category: 'general',
      license: body.license ?? 'closed',
      release_date: body.release_date ?? new Date().toISOString().slice(0, 10),
      params: body.params,
      context_window: body.context_window,
      modalities: body.modalities ?? ['text'],
      architecture: body.architecture,
      innovation: body.innovation,
      source_url: body.source_url,
      data_source: 'manual',
      confidence_score: 0.7,
    })
    .select('id')
    .single()

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
  const modelId = model.id

  // 3. Insert benchmarks
  // Ground truth: model_scores.ts > LLM-extracted (prevents hallucination errors)
  const canonicalScores = MODEL_SCORES[body.name ?? ''] ?? {}

  const benchmarksToSave: { name: string; score: number }[] = []

  // Merge: canonical scores override LLM-extracted for known benchmark names
  const llmMap = new Map((body.benchmarks ?? []).map(b => [b.name.toLowerCase(), b.score]))
  const CANONICAL_MAP: Record<string, string> = {
    coding:     'SWE-bench',
    reasoning:  'MMLU',
    math:       'MATH',
  }
  for (const [dim, bmName] of Object.entries(CANONICAL_MAP)) {
    const score = (canonicalScores as any)[dim]
    if (score != null && score > 0) benchmarksToSave.push({ name: bmName, score })
    else if (llmMap.has(bmName.toLowerCase())) benchmarksToSave.push({ name: bmName, score: llmMap.get(bmName.toLowerCase())! })
  }
  // Keep any extra LLM-extracted benchmarks not covered by canonical
  const coveredNames = new Set(Object.values(CANONICAL_MAP).map(n => n.toLowerCase()))
  for (const b of body.benchmarks ?? []) {
    if (!coveredNames.has(b.name.toLowerCase())) benchmarksToSave.push(b)
  }

  for (const bm of benchmarksToSave) {
    const { data: bmDef } = await supabase
      .from('benchmarks')
      .select('id')
      .ilike('name', bm.name)
      .single()
    if (bmDef) {
      await supabase.from('model_benchmarks').insert({
        model_id: modelId,
        benchmark_id: bmDef.id,
        score: bm.score,
        source: canonicalScores ? 'official' : 'llm_extracted',
        tested_at: new Date().toISOString().slice(0, 10),
        confidence_score: canonicalScores ? 1.0 : 0.7,
      })
    }
  }

  // 4. Insert price history
  if (body.input_price !== null && body.output_price !== null) {
    await supabase.from('price_history').insert({
      model_id: modelId,
      input_price_per_million: body.input_price,
      output_price_per_million: body.output_price,
      effective_from: new Date().toISOString().slice(0, 10),
      source: 'manual',
    })
  }

  return NextResponse.json({ id: modelId }, { status: 201 })
}
