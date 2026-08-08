import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from './Footer'

export function LegalPageLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 md:px-8">
          <Link to="/" className="font-heading text-lg font-bold text-navy">
            Crewclock
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted-fg">
            <Link to="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-fg">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 md:px-8">
        <h1 className="font-heading text-3xl font-extrabold text-fg">{title}</h1>
        <p className="mt-2 text-sm text-muted-fg">Last updated {updated}</p>
        <div className="mt-8 flex flex-col gap-6">{children}</div>
      </main>

      <Footer />
    </div>
  )
}
