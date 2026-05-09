import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()

  const { data: models, error } = await supabase
    .from('models')
    .select(`
      id, name, color, category, params, context_window, modalities,
      license, release_date, innovation, architecture, training_details,
      company:companies(id, name, region, type),
      benchmarks:model_benchmarks(
        score,
        benchmark:benchmarks(name, unit)
      ),
      price:price_history(
        input_price_per_million, output_price_per_million, effective_from
      ),
      cap_scores:model_capability_scores(
        coding, agentic, multimodal, reasoning, math, hallucination
      ),
      rich_profile:model_rich_profiles(
        capabilities, applications, impact_tags, impact_summary
      )
    `)
    .is('archived_at', null)
    .order('release_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 转换为前端需要的格式
  const formatted = models?.map((m) => {
    const bms: any[] = m.benchmarks ?? []
    const bm = (name: string) => bms.find((b: any) => b.benchmark?.name === name)?.score ?? null

    const swe  = bm('SWE-bench') ?? bm('HumanEval')
    const mmlu = bm('MMLU')
    const tps  = bm('TPS')
    const math = bm('MATH') ?? bm('GSM8K') ?? bm('AIME')
    const hallucination = bm('TruthfulQA')
    const reasoning2    = bm('GPQA')
    const agentic       = bm('Arena ELO') != null
      ? Math.min(100, Math.round((bm('Arena ELO') - 900) / 7))
      : null
    const multimodal    = bm('MMMU') ?? bm('AA Quality')

    // cap_scores from new table (single row joined as array — take first)
    const cap = Array.isArray((m as any).cap_scores)
      ? (m as any).cap_scores[0] ?? null
      : (m as any).cap_scores ?? null

    // rich_profile from new table
    const rp = Array.isArray((m as any).rich_profile)
      ? (m as any).rich_profile[0] ?? null
      : (m as any).rich_profile ?? null

    // 取最新价格
    const latestPrice = m.price?.sort((a: any, b: any) =>
      b.effective_from.localeCompare(a.effective_from)
    )[0]

    return {
      id: m.id,
      name: m.name,
      company: (m.company as any)?.name ?? '',
      companyColor: m.color ?? '#888',
      color: m.color ?? '#888',
      params: m.params ?? '',
      ctx: m.context_window ?? '',
      context_window: m.context_window ?? '',
      swe,
      mmlu,
      tps,
      // DB benchmark dims (legacy — kept for backward compat)
      db_math:          math,
      db_hallucination: hallucination,
      db_reasoning2:    reasoning2,
      db_agentic:       agentic,
      db_multimodal:    multimodal,
      // New: structured 6-dim capability scores
      cap_scores: cap,
      // New: rich profile (capabilities, applications, impact_tags, impact_summary)
      rich_profile: rp,
      pi: latestPrice?.input_price_per_million ?? 0,
      po: latestPrice?.output_price_per_million ?? 0,
      lic: m.license,
      license: m.license,
      modal: Array.isArray(m.modalities) ? m.modalities.join(' ') : '',
      modalities: m.modalities ?? [],
      date: m.release_date,
      category: m.category,
      arch: m.architecture ?? '',
      innov: m.innovation ?? '',
    }
  })

  return NextResponse.json(formatted)
}
