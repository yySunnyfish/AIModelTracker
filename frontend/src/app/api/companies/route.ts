import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()

  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, region, type, valuation, valuation_amount, founded_year, business_model, pricing_model, international_reach, moat')
    .is('archived_at', null)
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(companies)
}
