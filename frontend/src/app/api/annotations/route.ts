import { NextResponse } from 'next/server'
import { requireWriteAccess } from '@/lib/route_auth'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const modelId = searchParams.get('model_id')

  const supabase = createServerClient()

  let query = supabase
    .from('annotations')
    .select('id, model_id, content, author_name, visibility, is_pinned, created_at, updated_at')
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (modelId) query = query.eq('model_id', modelId)

  const { data, error } = await query.limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const authError = await requireWriteAccess(request)
  if (authError) return authError
  const body = await request.json()
  const { model_id, content, author_name, visibility = 'public' } = body

  if (!model_id || !content?.trim()) {
    return NextResponse.json({ error: 'model_id and content required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('annotations')
    .insert({
      model_id,
      content: content.trim(),
      author_name: author_name?.trim() || 'Anonymous',
      visibility,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
