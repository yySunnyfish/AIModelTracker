import { NextResponse } from 'next/server'

import { getAppSession } from '@/lib/auth'

type RouteRole = 'admin' | 'editor'

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 })
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}

function roleAllows(role: string | undefined, required: RouteRole) {
  if (role === 'admin') return true
  if (required === 'editor' && role === 'editor') return true
  return false
}

async function requireSessionRole(required: RouteRole) {
  const session = await getAppSession()
  if (!session?.user) {
    return unauthorized('Authentication required')
  }

  const role = (session.user as { role?: string }).role
  if (!roleAllows(role, required)) {
    return forbidden('Insufficient role')
  }

  return null
}

export async function requireAdminAccess(_: Request): Promise<NextResponse | null> {
  return requireSessionRole('admin')
}

export async function requireWriteAccess(_: Request): Promise<NextResponse | null> {
  return requireSessionRole('editor')
}

export function isUnsafeFilePatchEnabled() {
  return process.env.ENABLE_STATIC_FILE_PATCH === 'true'
}
