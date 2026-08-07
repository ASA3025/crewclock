import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border bg-white px-4 py-5 md:px-8 md:py-6">
      <div>
        <h1 className="font-heading text-xl font-bold text-fg md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-fg">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
