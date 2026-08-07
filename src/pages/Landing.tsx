import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, MapPin, CheckCircle } from '@phosphor-icons/react'
import { Button } from '../components/Button'
import { LoginModal } from '../components/LoginModal'

const pillars = [
  {
    icon: Clock,
    title: 'Clock in, clock out',
    body: 'One tap to start and end a shift. No more texting a manager and hoping they wrote it down right.',
  },
  {
    icon: MapPin,
    title: 'Location attached',
    body: 'Every clock-in captures where the work happened, automatically.',
  },
  {
    icon: CheckCircle,
    title: 'Ready for payroll',
    body: 'Approve hours, export a clean CSV, hand it to your accountant. Done.',
  },
]

export function Landing() {
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
          <Link to="/" className="font-heading text-lg font-bold text-navy">
            Crewclock
          </Link>
          <Button variant="secondary" size="md" onClick={() => setLoginOpen(true)}>
            Log in
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-4 py-16 text-center md:py-24">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-fg md:text-5xl">
            Stop texting your hours in.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-fg md:text-lg">
            Crewclock — clock in/out with location, roster your crew, and export hours for
            payroll. Built for contracting and field crews.
          </p>
        </section>

        <section className="border-t border-border bg-white">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 md:grid-cols-3 md:px-8">
            {pillars.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy/5 text-navy">
                  <Icon size={22} weight="regular" />
                </span>
                <h2 className="font-heading text-base font-bold text-fg">{title}</h2>
                <p className="text-sm leading-relaxed text-muted-fg">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted-fg">
        Crewclock — built for contracting and field crews.
      </footer>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  )
}
