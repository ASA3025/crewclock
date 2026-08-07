import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'accent' | 'secondary' | 'destructive' | 'ghost'
type Size = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  icon?: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-navy text-navy-fg hover:bg-navy/90 active:bg-navy/80',
  accent: 'bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80',
  secondary: 'bg-white text-fg border border-border hover:bg-muted',
  destructive: 'bg-destructive text-destructive-fg hover:bg-destructive/90',
  ghost: 'bg-transparent text-fg hover:bg-muted',
}

const sizeClasses: Record<Size, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-heading font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
