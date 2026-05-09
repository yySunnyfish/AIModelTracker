import { NextResponse } from 'next/server'
import { requireAdminAccess } from '@/lib/route_auth'
/**
 * POST /api/admin/enrich-model
 *
 * Retroactively enriches existing DB models with:
 *   - pricing (input_price, output_price) from OpenRouter
 *   - context_window from OpenRouter
 *
 * Body: { modelIds?: string[] }   — empty/omitted = all models missing pricing
 *
 * SSE stream:
 *   data: { type: 'progress', modelId, name, updated: string[], or_id?: string }
 *   data: { type: 'done', enriched, skipped, total }
 */

import { createServerClient } from '@/lib/supabase'
import { enrichFromOpenRouter } from '@/lib/openrouter_enricher'
import { getBenchmarkIdMap } from '@/lib/benchmark_seeder'

export const maxDuration = 300

export async function POST(request: Request) {
  const authError = requireAdminAccess(request)
  if (authError) return authError
  const body    = await request.json().catch(() => ({}))
  const modelIds: string[] | undefined = body.modelIds

  const supabase = createServerClient()
  const encoder  = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      // Ensure benchmark reference table is seeded
      await getBenchmarkIdMap()

      // Fetch target models
      let query = supabase
        .from('models')
        .select(`
          id, name, context_window, license,
          company:companies(name),
          price:price_history(input_price_per_million, output_price_per_million, effective_from)
        `)
        .is('archived_at', null)

      if (modelIds && modelIds.length > 0) {
        query = query.in('id', modelIds) as any
      }

      const { data: models, error } = await query as any
      if (error) {
        send({ type: 'error', message: error.message })
        controller.close()
        return
      }

      let enriched = 0, skipped = 0

      for (const m of models ?? []) {
        const company = (m.company as any)?.name ?? ''

        // Check if already has both pricing and context
        const latestPrice = (m.price ?? []).sort((a: any, b: any) =>
          b.effective_from.localeCompare(a.effective_from))[0]
        const hasPrice   = latestPrice?.input_price_per_million > 0
        const hasContext = !!m.context_window

        if (hasPrice && hasContext) {
          skipped++
          continue
        }

        const or = await enrichFromOpenRouter(m.name, company).catch(() => null)
        if (!or) {
          skipped++
          send({ type: 'progress', modelId: m.id, name: m.name, updated: [], note: 'no OR match' })
          continue
        }

        const updated: string[] = []
        const today = new Date().toISOString().slice(0, 10)

        // Update context_window in models table
        if (!hasContext && or.context_window) {
          await supabase
            .from('models')
            .update({ context_window: or.context_window })
            .eq('id', m.id)
          updated.push(`context_window=${or.context_window}`)
        }

        // Upsert price_history
        if (!hasPrice) {
          await supabase.from('price_history').upsert({
            model_id:                 m.id,
            input_price_per_million:  or.input_price_per_million,
            output_price_per_million: or.output_price_per_million,
            effective_from:           today,
            source:                   'openrouter',
          }, { onConflict: 'model_id,effective_from' })
          updated.push(`price=${or.input_price_per_million}/${or.output_price_per_million}/M`)
        }

        if (updated.length > 0) enriched++
        send({ type: 'progress', modelId: m.id, name: m.name, updated, or_id: or.or_model_id })

        // Small delay to avoid rate-limiting OpenRouter (cached after first call)
        await new Promise(r => setTimeout(r, 50))
      }

      send({ type: 'done', enriched, skipped, total: (models ?? []).length })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
