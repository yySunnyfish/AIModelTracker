import { NextResponse } from 'next/server'

import { getAppSession } from '@/lib/auth'

const ADMIN_HEADER = 'x-admin-secret'
const WRITE_HEADER = 'x-write-secret'

type RouteRole = 'admin' | 'editor'

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 })
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}

function getHeader(request: Request, name: string): string | null {
  return request.headers.get(name) ?? request.headers.get(name.toUpperCase())
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

function requireSecret(request: Request, headerName: string, envName: 'ADMIN_API_SECRET' | 'WRITE_API_SECRET') {
  const configuredSecret = process.env[envName]
  if (!configuredSecret) return null

  const providedSecret = getHeader(request, headerName)
  if (!providedSecret) {
    return unauthorized(`Missing ${headerName} header`)
  }

  if (providedSecret !== configuredSecret) {
    return forbidden(`Invalid ${headerName}`)
  }

  return null
}

export async function requireAdminAccess(request: Request): Promise<NextResponse | null> {
  const secretBlock = requireSecret(request, ADMIN_HEADER, 'ADMIN_API_SECRET')
  if (secretBlock !== null) return secretBlock
  if (process.env.ADMIN_API_SECRET) return null
  return requireSessionRole('admin')
}

export async function requireWriteAccess(request: Request): Promise<NextResponse | null> {
  const adminBlock = requireSecret(request, ADMIN_HEADER, 'ADMIN_API_SECRET')
  if (adminBlock === null && process.env.ADMIN_API_SECRET) return null
  if (adminBlock && process.env.ADMIN_API_SECRET) return adminBlock

  const writeBlock = requireSecret(request, WRITE_HEADER, 'WRITE_API_SECRET')
  if (writeBlock === null && process.env.WRITE_API_SECRET) return null
  if (writeBlock && process.env.WRITE_API_SECRET) return writeBlock

  return requireSessionRole('editor')
}

export function isUnsafeFilePatchEnabled() {
  return process.env.ENABLE_STATIC_FILE_PATCH === 'true'
}
