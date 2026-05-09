import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const benchmarkName = searchParams.get('name') ?? 'SWE-bench'

  const supabase = createAnonServerClient()

  const { data: benchmarkDef, error: benchmarkError } = await supabase
    .from('benchmarks')
    .select('id, name, unit')
    .eq('name', benchmarkName)
    .single()

  if (benchmarkError) {
    return NextResponse.json({ error: benchmarkError.message }, { status: 500 })
  }

  if (!benchmarkDef) {
    return NextResponse.json([])
  }

  const { data, error } = await supabase
    .from('model_benchmarks')
    .select(`
      score,
      tested_at,
      model:models(id, name, color, company:companies(name))
    `)
    .eq('benchmark_id', benchmarkDef.id)
    .order('score', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const formatted = data
    ?.filter((r: any) => r.benchmark && r.model)
    .map((r: any) => ({
      name: r.model.name,
      company: r.model.company?.name ?? '',
      color: r.model.color ?? '#888',
      score: r.score,
      tested_at: r.tested_at,
      benchmark: benchmarkDef.name,
    }))

  return NextResponse.json(formatted)
}
