import type { ReactNode } from 'react'
import { LegalPageLayout } from '../components/LegalPageLayout'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-lg font-bold text-fg">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-fg">{children}</div>
    </section>
  )
}

export function Terms() {
  return (
    <LegalPageLayout title="Terms of Service" updated="8 August 2026">
      <p className="text-sm leading-relaxed text-muted-fg">
        These are the basic terms for using Crewclock, written in plain language rather than as
        a formal legal document. By using the app, you agree to them. If you have questions,
        contact us (details at the bottom).
      </p>

      <Section title="What Crewclock is">
        <p>
          A tool for clocking in and out, rostering a crew, and estimating pay for contracting
          and field-work businesses.
        </p>
        <p>
          Pay estimates shown in the app are a simple flat calculation — hours worked × hourly
          rate, before tax, without holiday multipliers or full payroll compliance built in.
          They're a helpful estimate, not a substitute for proper payroll processing — always
          check actual pay obligations (tax, holiday pay, minimum wage, etc.) independently
          before paying anyone.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          Keep your login details to yourself — you're responsible for activity that happens
          under your account. Admins are responsible for the accuracy of the worker information
          and pay rates they enter into the system.
        </p>
      </Section>

      <Section title="Using the app fairly">
        <p>
          Use Crewclock honestly — accurate clock-ins, accurate information. Don't try to access
          data that isn't yours or another business's account.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          Your business's data belongs to your business — we don't claim ownership of it. If you
          stop using Crewclock, you can ask us to delete your business's data (see the Privacy
          Policy for how account and data deletion works).
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          Crewclock is provided as-is. We do our best to keep it accurate and available, but
          can't guarantee it will be error-free or uninterrupted at all times.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent the law allows, we aren't liable for indirect losses arising from using
          the app — including, but not limited to, payroll or business decisions made based on
          the pay estimates it shows. Use your own judgement, particularly around anything
          involving pay.
        </p>
      </Section>

      <Section title="Changes and termination">
        <p>
          These terms may be updated from time to time — continuing to use Crewclock after a
          change means you accept the update. We may suspend or terminate access for misuse of
          the app.
        </p>
      </Section>

      <Section title="Governing law">
        <p>Crewclock is intended for use by New Zealand businesses and governed by NZ law.</p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms:{' '}
          <a
            href="mailto:crewclocknz@gmail.com"
            className="text-accent hover:underline"
          >
            crewclocknz@gmail.com
          </a>
        </p>
      </Section>
    </LegalPageLayout>
  )
}
