import { Check, X } from '@phosphor-icons/react'
import {
  getPasswordRequirements,
  getPasswordStrength,
  PASSWORD_MIN_LENGTH,
  type PasswordStrength,
} from '../utils/passwordStrength'

const strengthMeta: Record<
  PasswordStrength,
  { label: string; barColor: string; textColor: string; segments: number }
> = {
  weak: { label: 'Weak', barColor: 'bg-destructive', textColor: 'text-destructive', segments: 1 },
  okay: { label: 'Okay', barColor: 'bg-warning', textColor: 'text-warning', segments: 2 },
  strong: { label: 'Strong', barColor: 'bg-success', textColor: 'text-success', segments: 3 },
}

export function PasswordStrengthField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'new-password',
  // Admin-facing "set worker password" wants the typed value visible so it
  // can be read back and relayed to the worker directly.
  type = 'password',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  type?: 'password' | 'text'
}) {
  const requirements = getPasswordRequirements(value)
  const strength = getPasswordStrength(value)
  const meta = strengthMeta[strength]

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        minLength={PASSWORD_MIN_LENGTH}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent"
      />

      {value && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-150 ${
                    i < meta.segments ? meta.barColor : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs font-medium ${meta.textColor}`}>{meta.label}</span>
          </div>

          <ul className="flex flex-col gap-1">
            {requirements.map((req) => (
              <li
                key={req.label}
                className={`flex items-center gap-1.5 text-xs ${req.met ? 'text-success' : 'text-muted-fg'}`}
              >
                {req.met ? <Check size={12} weight="bold" /> : <X size={12} />}
                {req.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
