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

export function Privacy() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="8 August 2026">
      <p className="text-sm leading-relaxed text-muted-fg">
        Crewclock is a clock-in, rostering, and pay-estimate tool for contracting and field
        crews. This page explains what personal information it collects, why, and what happens
        to it. It's written in plain language rather than as a formal legal document — if you
        have questions it doesn't answer, contact us (details at the bottom).
      </p>

      <Section title="Information we collect">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <span className="font-medium text-fg">Account information</span> — your name, email
            address, and role (admin or worker) within your business.
          </li>
          <li>
            <span className="font-medium text-fg">Pay information</span> — your hourly rate, if
            your business uses it to estimate pay. Only your business's admins can see this.
          </li>
          <li>
            <span className="font-medium text-fg">Shift data</span> — clock-in and clock-out
            times, the GPS location captured when you clock in, and any photo or note you
            optionally attach to a shift.
          </li>
          <li>
            <span className="font-medium text-fg">Roster information</span> — the work location
            and times an admin assigns you, if your business uses the roster feature.
          </li>
        </ul>
      </Section>

      <Section title="How we use this information">
        <p>
          To run the app: identifying you when you log in, calculating hours and pay estimates,
          showing you your roster, and letting your business's admin review and approve shifts.
        </p>
        <p>
          Your clock-in location is recorded so a shift can be verified as worked from the right
          place. On the admin's hours page, that GPS coordinate is also turned into a readable
          address using OpenStreetMap's free Nominatim service — the coordinate is sent to that
          service only to resolve an address, and for nothing else.
        </p>
      </Section>

      <Section title="Who can see your data">
        <p>
          Your business's admin(s) can see your shifts, hours, pay estimates, and roster. This
          isolation between businesses is enforced at the database level (row-level security),
          not just hidden in the app's interface — one business's data is never visible to
          another, even accidentally.
        </p>
      </Section>

      <Section title="Data sharing">
        <p>
          We don't sell your information, and we don't share it with anyone for advertising or
          marketing purposes. Running the app relies on a small number of service providers:
          Supabase, which hosts the app and its database, and OpenStreetMap's Nominatim service,
          used only for the address lookup described above. Your data doesn't pass through
          anything beyond these, and only for the purposes described on this page.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Your information is kept for as long as your account and business remain active on
          Crewclock. If an admin removes a worker's account, that worker's shift and roster
          history is permanently deleted along with it — this is an intentional, irreversible
          part of how account removal works, not a separate process.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask your admin to correct any information about you that's wrong, or to remove
          your account. If you'd rather contact us directly with a privacy question or request,
          use the email address below.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy occasionally as the app changes. The date at the top of this
          page reflects the last update.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data:{' '}
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
