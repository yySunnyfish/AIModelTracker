import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const license = searchParams.get('license')       // 'open' | 'closed' | 'partial' | null
  const category = searchParams.get('category')     // model_category | null
  const maxPrice = parseFloat(searchParams.get('maxPrice') ?? '999')
  const minSwe = parseFloat(searchParams.get('minSwe') ?? '0')

  const supabase = createServerClient()

  let query = supabase
    .from('models')
    .select(`
      id, name, color, category, params, context_window, license, modalities, innovation,
      company:companies(name, region),
      benchmarks:model_benchmarks(score, benchmark:benchmarks(name)),
      price:price_history(input_price_per_million, output_price_per_million, effective_from)
    `)
    .is('archived_at', null)

  if (license) query = query.eq('license', license)
  if (category) query = query.eq('category', category)

  const { data, error } = await query.order('release_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data?.map((m: any) => {
    const swe = m.benchmarks?.find((b: any) => b.benchmark?.name === 'SWE-bench')?.score ?? null
    const mmlu = m.benchmarks?.find((b: any) => b.benchmark?.name === 'MMLU')?.score ?? null
    const latestPrice = m.price?.sort((a: any, b: any) =>
      b.effective_from.localeCompare(a.effective_from)
    )[0]

    return {
      id: m.id,
      name: m.name,
      company: m.company?.name ?? '',
      region: m.company?.region ?? '',
      color: m.color ?? '#888',
      category: m.category,
      license: m.license,
      params: m.params,
      contextWindow: m.context_window,
      modalities: m.modalities,
      innovation: m.innovation,
      swe,
      mmlu,
      inputPrice: latestPrice?.input_price_per_million ?? 0,
      outputPrice: latestPrice?.output_price_per_million ?? 0,
    }
  }).filter((m: any) =>
    m.inputPrice <= maxPrice && (minSwe === 0 || (m.swe !== null && m.swe >= minSwe))
  )

  return NextResponse.json(result)
}
