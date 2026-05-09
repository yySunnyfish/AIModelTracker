import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const benchmarkName = searchParams.get('name') ?? 'SWE-bench'

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('model_benchmarks')
    .select(`
      score,
      tested_at,
      model:models(id, name, color, company:companies(name)),
      benchmark:benchmarks(name, unit)
    `)
    .eq('benchmark.name', benchmarkName)
    .not('benchmark', 'is', null)
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
      benchmark: r.benchmark.name,
    }))

  return NextResponse.json(formatted)
}
