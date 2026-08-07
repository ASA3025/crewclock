import type { ReactNode } from 'react'

type Tone = 'success' | 'muted' | 'accent' | 'destructive'

const toneClasses: Record<Tone, string> = {
  success: 'bg-success/10 text-success',
  muted: 'bg-muted text-muted-fg',
  accent: 'bg-accent/10 text-accent',
  destructive: 'bg-destructive/10 text-destructive',
}

export function StatusPill({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {icon}
      {children}
    </span>
  )
}
