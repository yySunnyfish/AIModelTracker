import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ids = searchParams.get('ids')?.split(',').filter(Boolean) ?? []

  if (ids.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 model ids' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('models')
    .select(`
      id, name, color, category, params, context_window, license, modalities, innovation, architecture,
      release_date,
      company:companies(name, region),
      benchmarks:model_benchmarks(score, benchmark:benchmarks(name)),
      price:price_history(input_price_per_million, output_price_per_million, effective_from)
    `)
    .in('id', ids)
    .is('archived_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data?.map((m: any) => {
    const latestPrice = m.price?.sort((a: any, b: any) =>
      b.effective_from.localeCompare(a.effective_from)
    )[0]

    const benchmarkMap: Record<string, number> = {}
    m.benchmarks?.forEach((b: any) => {
      if (b.benchmark?.name) benchmarkMap[b.benchmark.name] = b.score
    })

    return {
      id: m.id,
      name: m.name,
      company: m.company?.name ?? '',
      region: m.company?.region ?? '',
      color: m.color ?? m.company?.color ?? '#888',
      category: m.category,
      license: m.license,
      params: m.params,
      contextWindow: m.context_window,
      modalities: m.modalities ?? [],
      innovation: m.innovation,
      architecture: m.architecture,
      releaseDate: m.release_date,
      benchmarks: benchmarkMap,
      inputPrice: latestPrice?.input_price_per_million ?? 0,
      outputPrice: latestPrice?.output_price_per_million ?? 0,
    }
  })

  // Sort by original ids order
  const ordered = ids.map(id => result?.find((m: any) => m.id === id)).filter(Boolean)
  return NextResponse.json(ordered)
}
