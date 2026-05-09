'use client'

import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'

interface HeaderProps {
  activeView: string
  onNavChange: (view: string) => void
  onAddModel?: () => void
  onDiscoverModels?: () => void
}

export function Header({ activeView, onNavChange, onAddModel, onDiscoverModels }: HeaderProps) {
  const { data: session, status } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role ?? null
  const username = session?.user?.name ?? 'Signed in'
  const navItems = [
    { id: 'timeline', label: 'Timeline', href: null },
    { id: 'leaderboards', label: 'Leaderboards', href: null },
    { id: 'landscape', label: 'Landscape', href: null },
    { id: 'company', label: 'Company Analysis', href: null },
    { id: 'compare', label: 'Compare', href: '/compare' },
  ]

  return (
    <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Link href="/" className="flex h-[26px] w-[26px] items-center justify-center rounded bg-primary text-xs font-semibold text-white">
          MT
        </Link>
        <div>
          <div className="text-sm font-semibold text-[var(--t1)]">ModelTrack</div>
          <div className="text-2-xs text-[var(--t3)]">Global AI model intelligence</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="ml-1 flex gap-0.5 rounded-lg bg-[var(--bg2)] p-[3px]">
        {navItems.map((item) =>
          item.href ? (
            <Link
              key={item.id}
              href={item.href}
              className="rounded-md px-3 py-[5px] text-[11px] font-medium transition-colors text-[var(--t2)] hover:text-[var(--t1)]"
            >
              {item.label} ↗
            </Link>
          ) : (
            <button
              key={item.id}
              onClick={() => onNavChange(item.id)}
              className={`rounded-md px-3 py-[5px] text-[11px] font-medium transition-colors ${
                activeView === item.id
                  ? 'border border-[var(--border)] bg-[var(--bg)] text-[var(--t1)]'
                  : 'text-[var(--t2)] hover:text-[var(--t1)]'
              }`}
            >
              {item.label}
            </button>
          )
        )}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        {status === 'authenticated' ? (
          <div className="mr-1 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg2)] px-3 py-1.5">
            <div className="text-right">
              <div className="text-[10px] font-semibold text-[var(--t1)]">{username}</div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--t3)]">{role ?? 'viewer'}</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--t2)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--t1)]"
            >
              Sign out
            </button>
          </div>
        ) : status === 'loading' ? (
          <div className="mr-1 rounded-full border border-[var(--border)] bg-[var(--bg2)] px-3 py-1.5 text-[10px] text-[var(--t3)]">
            Checking session...
          </div>
        ) : (
          <Link
            href="/login"
            className="mr-1 rounded-full border border-[var(--border)] bg-[var(--bg2)] px-3 py-1.5 text-[10px] font-medium text-[var(--t2)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--t1)]"
          >
            Sign in
          </Link>
        )}
        {onDiscoverModels && (
          <button
            onClick={onDiscoverModels}
            className="flex items-center gap-1 rounded-[7px] border border-blue-200 bg-blue-50 px-[10px] py-[5px] text-[11px] text-blue-700 hover:bg-blue-100"
          >
            <span className="text-base leading-none">⟳</span> 发现新模型
          </button>
        )}
        {onAddModel && (
          <button
            onClick={onAddModel}
            className="flex items-center gap-1 rounded-[7px] border border-[var(--border)] bg-transparent px-[10px] py-[5px] text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]"
          >
            <span className="text-base leading-none">⊕</span> 添加/更新
          </button>
        )}
        <Link href="/selector" className="rounded-[7px] border border-[var(--border)] bg-transparent px-[10px] py-[5px] text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]">
          Selector ↗
        </Link>
        <Link href="/price-calculator" className="rounded-[7px] border border-[var(--border)] bg-transparent px-[10px] py-[5px] text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]">
          Pricing ↗
        </Link>
        <Link href="/deploy" className="rounded-[7px] border border-[var(--border)] bg-transparent px-[10px] py-[5px] text-[11px] text-[var(--t2)] hover:bg-[var(--bg2)]">
          Deploy ↗
        </Link>
      </div>
    </header>
  )
}
