import { NextResponse } from 'next/server'
import { requireWriteAccess } from '@/lib/route_auth'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireWriteAccess(request)
  if (authError) return authError
  const { id } = await params
  const body = await request.json()
  const { content, is_pinned, visibility } = body

  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (content !== undefined) update.content = content.trim()
  if (is_pinned !== undefined) update.is_pinned = is_pinned
  if (visibility !== undefined) update.visibility = visibility

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('annotations')
    .update(update)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireWriteAccess(request)
  if (authError) return authError
  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase
    .from('annotations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
