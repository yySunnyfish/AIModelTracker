'use client'

import { FormEvent, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
      callbackUrl,
    })

    setSubmitting(false)

    if (!result || result.error) {
      setError('Invalid username or password')
      return
    }

    router.push(result.url ?? callbackUrl)
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ec_0%,#fffdf8_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
        <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(60,40,10,0.08)]">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">ModelTrack Access</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Sign in</h1>
            <p className="mt-2 text-sm text-stone-600">Use the configured internal account to access protected actions.</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Username</span>
              <input
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-stone-500"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Password</span>
              <input
                type="password"
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none transition focus:border-stone-500"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
