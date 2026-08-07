import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-border bg-white p-4 shadow-sm ${className}`}
      {...rest}
    />
  )
}
