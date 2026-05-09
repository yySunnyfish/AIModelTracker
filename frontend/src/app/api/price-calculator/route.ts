import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const inputTokensM = parseFloat(searchParams.get('input') ?? '1')   // 百万 tokens
  const outputTokensM = parseFloat(searchParams.get('output') ?? '0.5')

  const supabase = createAnonServerClient()

  // 取每个模型的最新价格
  const { data, error } = await supabase
    .from('price_history')
    .select(`
      input_price_per_million,
      output_price_per_million,
      effective_from,
      model:models(id, name, color, license, category, company:companies(name))
    `)
    .order('effective_from', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 每个模型只保留最新价格
  const seen = new Set<string>()
  const latest = data?.filter((r: any) => {
    if (!r.model?.id || seen.has(r.model.id)) return false
    seen.add(r.model.id)
    return true
  })

  const result = latest?.map((r: any) => {
    const totalCost = r.input_price_per_million * inputTokensM + r.output_price_per_million * outputTokensM
    return {
      id: r.model.id,
      name: r.model.name,
      company: r.model.company?.name ?? '',
      color: r.model.color ?? '#888',
      license: r.model.license,
      category: r.model.category,
      inputPrice: r.input_price_per_million,
      outputPrice: r.output_price_per_million,
      totalCost: Math.round(totalCost * 100) / 100,
    }
  }).sort((a: any, b: any) => a.totalCost - b.totalCost)

  return NextResponse.json(result)
}
