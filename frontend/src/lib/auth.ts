import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { getServerSession } from 'next-auth'

export type AppRole = 'admin' | 'editor' | 'viewer'

function normalizeRole(value?: string | null): AppRole {
  if (value === 'admin' || value === 'editor' || value === 'viewer') return value
  return 'viewer'
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const expectedUsername = process.env.APP_ADMIN_USERNAME
        const expectedPassword = process.env.APP_ADMIN_PASSWORD

        if (!expectedUsername || !expectedPassword) {
          throw new Error('APP_ADMIN_USERNAME and APP_ADMIN_PASSWORD must be configured')
        }

        if (
          credentials?.username !== expectedUsername ||
          credentials?.password !== expectedPassword
        ) {
          return null
        }

        return {
          id: 'local-admin',
          name: expectedUsername,
          email: process.env.APP_ADMIN_EMAIL ?? null,
          role: normalizeRole(process.env.APP_ADMIN_ROLE ?? 'admin'),
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = normalizeRole((user as any).role)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as typeof session.user & { role?: AppRole }).role = normalizeRole(token.role as string | undefined)
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

export function getAppSession() {
  return getServerSession(authOptions)
}
