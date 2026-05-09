import { NextResponse } from 'next/server'

const ADMIN_HEADER = 'x-admin-secret'
const WRITE_HEADER = 'x-write-secret'

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 })
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}

function getHeader(request: Request, name: string): string | null {
  return request.headers.get(name) ?? request.headers.get(name.toUpperCase())
}

export function requireAdminAccess(request: Request): NextResponse | null {
  const configuredSecret = process.env.ADMIN_API_SECRET
  if (!configuredSecret) {
    return forbidden('Admin routes are disabled until ADMIN_API_SECRET is configured')
  }

  const providedSecret = getHeader(request, ADMIN_HEADER)
  if (!providedSecret) {
    return unauthorized(`Missing ${ADMIN_HEADER} header`)
  }

  if (providedSecret !== configuredSecret) {
    return forbidden('Invalid admin secret')
  }

  return null
}

export function requireWriteAccess(request: Request): NextResponse | null {
  const adminBlock = requireAdminAccess(request)
  if (!adminBlock) return null

  const configuredSecret = process.env.WRITE_API_SECRET
  if (!configuredSecret) {
    return forbidden('Write routes are disabled until WRITE_API_SECRET or ADMIN_API_SECRET is configured')
  }

  const providedSecret = getHeader(request, WRITE_HEADER)
  if (!providedSecret) {
    return unauthorized(`Missing ${WRITE_HEADER} header`)
  }

  if (providedSecret !== configuredSecret) {
    return forbidden('Invalid write secret')
  }

  return null
}

export function isUnsafeFilePatchEnabled() {
  return process.env.ENABLE_STATIC_FILE_PATCH === 'true'
}
