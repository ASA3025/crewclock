import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

export function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-lg ${className}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="modal-title" className="font-heading text-lg font-bold text-fg">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1 text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
