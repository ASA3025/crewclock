import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  CheckSquare,
  ChatCircleDots,
  ClockCountdown,
  CloudSun,
  CurrencyDollar,
  EnvelopeSimple,
  FileCsv,
  ListChecks,
  MapPin,
} from '@phosphor-icons/react'
import { Button } from '../components/Button'
import { Footer } from '../components/Footer'
import { LoginModal } from '../components/LoginModal'

const crewFeatures = [
  {
    icon: MapPin,
    title: 'GPS-verified clock in/out',
    body: 'Every clock-in and clock-out captures where it happened, with optional photo and note attachments for extra context.',
  },
  {
    icon: ChatCircleDots,
    title: 'Live roster, two-way flagging',
    body: "Workers see their upcoming shifts and can flag issues — wrong location, can't make it — with admin replies right in the thread.",
  },
  {
    icon: CurrencyDollar,
    title: 'Live daily pay estimate',
    body: "A running estimate of the day's pay updates on the worker's home screen as their shift goes, no waiting for payday to see it.",
  },
  {
    icon: CloudSun,
    title: 'Weather for your crew',
    body: "Current conditions on a worker's home screen — handy context before heading out to outdoor work.",
  },
]

const managementFeatures = [
  {
    icon: CheckSquare,
    title: 'Approval workflow, real addresses',
    body: "Review hours with GPS coordinates automatically turned into readable addresses, then approve, reject, or edit each worker's shift.",
  },
  {
    icon: ListChecks,
    title: 'Bulk approve hours',
    body: 'Select multiple shifts — or all of them — and approve them together instead of one at a time.',
  },
  {
    icon: FileCsv,
    title: 'Payroll-ready CSV exports',
    body: 'Export approved hours as a clean CSV, ready to hand to your accountant or payroll software.',
  },
  {
    icon: CalendarCheck,
    title: 'NZ public holiday awareness',
    body: 'Shifts falling on a public holiday are flagged on the Hours page, so pay decisions account for it before you approve.',
  },
  {
    icon: EnvelopeSimple,
    title: 'Weekly summary emails',
    body: "A Monday-morning email with last week's hours, estimated pay, and lateness/no-show counts per worker.",
  },
  {
    icon: ClockCountdown,
    title: 'Automatic no-show/late detection',
    body: "Compares actual clock-ins against the roster and flags who's running late or hasn't shown up — no manual checking required.",
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
            Crewclock — GPS-verified clock in/out, a live roster your crew can flag issues on,
            admin approvals with real addresses, and payroll-ready exports. Built for contracting
            and field crews.
          </p>
        </section>

        <section className="border-t border-border bg-white">
          <div className="mx-auto max-w-5xl px-4 py-14 md:px-8">
            <h2 className="text-center font-heading text-2xl font-extrabold text-fg md:text-3xl">
              How it works
            </h2>
            <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-fg">
              Everything your crew and your books need, in one app.
            </p>
            <div className="mt-10 grid gap-x-10 gap-y-12 lg:grid-cols-2">
              <div>
                <h3 className="border-b border-border pb-3 font-heading text-lg font-bold text-fg">
                  For Field Crews
                </h3>
                <div className="mt-8 grid gap-8 sm:grid-cols-2">
                  {crewFeatures.map(({ icon: Icon, title, body }) => (
                    <div key={title} className="flex flex-col items-start gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy/5 text-navy">
                        <Icon size={22} weight="regular" />
                      </span>
                      <h4 className="font-heading text-base font-bold text-fg">{title}</h4>
                      <p className="text-sm leading-relaxed text-muted-fg">{body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="border-b border-border pb-3 font-heading text-lg font-bold text-fg">
                  For Management
                </h3>
                <div className="mt-8 grid gap-8 sm:grid-cols-2">
                  {managementFeatures.map(({ icon: Icon, title, body }) => (
                    <div key={title} className="flex flex-col items-start gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy/5 text-navy">
                        <Icon size={22} weight="regular" />
                      </span>
                      <h4 className="font-heading text-base font-bold text-fg">{title}</h4>
                      <p className="text-sm leading-relaxed text-muted-fg">{body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  )
}
