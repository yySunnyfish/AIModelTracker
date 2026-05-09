/**
 * GET /api/admin/discover-new-models
 *
 * Discovers AI models released by tracked companies within a date range,
 * then cross-checks against the DB to flag which ones are new vs existing.
 *
 * Query params:
 *   since      — "YYYY-MM-DD" (default: 90 days ago)
 *   until      — "YYYY-MM-DD" (default: today)
 *   company    — comma-separated company names (default: all tracked for category)
 *   category   — "llm" | "embodied" | "both" (default: "llm")
 *   keywords   — comma-separated filter terms; candidate passes if name/company matches ANY
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  discoverNewModels,
  applyKeywordFilter,
  CandidateModel,
  ModelCategory,
  DEFAULT_LLM_COMPANIES,
  DEFAULT_EMBODIED_COMPANIES,
} from '@/lib/company_discovery'

export interface DiscoveredModel extends CandidateModel {
  alreadyInDb: boolean
  dbModelId?:  string
}

function defaultSince(): string {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const since      = searchParams.get('since')    ?? defaultSince()
  const until      = searchParams.get('until')    ?? today()
  const categoryQS = searchParams.get('category') ?? 'llm'
  const companyQS  = searchParams.get('company')
  const keywordsQS = searchParams.get('keywords')  ?? ''

  // Resolve categories
  const categories: ModelCategory[] =
    categoryQS === 'both'     ? ['llm', 'embodied'] :
    categoryQS === 'embodied' ? ['embodied'] :
    ['llm']

  // Resolve company list
  let companies: string[]
  if (companyQS) {
    companies = companyQS.split(',').map(s => s.trim()).filter(Boolean)
  } else if (categoryQS === 'embodied') {
    companies = DEFAULT_EMBODIED_COMPANIES
  } else if (categoryQS === 'both') {
    companies = [...new Set([...DEFAULT_LLM_COMPANIES, ...DEFAULT_EMBODIED_COMPANIES])]
  } else {
    companies = DEFAULT_LLM_COMPANIES
  }

  // Resolve keyword filter
  const keywords = keywordsQS
    ? keywordsQS.split(',').map(s => s.trim()).filter(Boolean)
    : []

  // ── 1. Discover candidates ─────────────────────────────────────────────────
  let candidates: CandidateModel[]
  try {
    candidates = await discoverNewModels(since, until, companies, categories)
  } catch (err: any) {
    return NextResponse.json({ error: `Discovery failed: ${err.message}` }, { status: 500 })
  }

  // ── 2. Apply keyword filter ────────────────────────────────────────────────
  if (keywords.length > 0) {
    candidates = applyKeywordFilter(candidates, keywords)
  }

  if (candidates.length === 0) {
    return NextResponse.json({ candidates: [], existingNames: [], since, until })
  }

  // ── 3. Cross-check against DB ──────────────────────────────────────────────
  const supabase = createServerClient()
  const { data: dbModels } = await supabase
    .from('models')
    .select('id, name')
    .is('archived_at', null)

  function normName(s: string) {
    return s.toLowerCase().replace(/[\s\-_.]/g, '')
  }

  const dbMap = new Map<string, string>()
  for (const m of dbModels ?? []) {
    dbMap.set(normName(m.name), m.id)
  }

  const results: DiscoveredModel[] = candidates.map(c => {
    const key = normName(c.name)
    const dbId = dbMap.get(key)
    return { ...c, alreadyInDb: !!dbId, dbModelId: dbId }
  })

  return NextResponse.json({
    candidates:    results,
    newCount:      results.filter(r => !r.alreadyInDb).length,
    existingCount: results.filter(r =>  r.alreadyInDb).length,
    existingNames: (dbModels ?? []).map(m => m.name),
    since,
    until,
    categories,
    keywords,
  })
}
