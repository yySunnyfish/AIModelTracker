import 'next-auth'
import 'next-auth/jwt'

import type { AppRole } from '@/lib/auth'

declare module 'next-auth' {
  interface Session {
    user?: {
      name?: string | null
      email?: string | null
      image?: string | null
      role?: AppRole
    }
  }

  interface User {
    role?: AppRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: AppRole
  }
}
