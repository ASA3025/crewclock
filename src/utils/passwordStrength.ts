export const PASSWORD_MIN_LENGTH = 8

export interface PasswordRequirement {
  label: string
  met: boolean
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'At least one number', met: /\d/.test(password) },
    { label: 'At least one special character', met: /[^A-Za-z0-9]/.test(password) },
  ]
}

export function meetsPasswordRequirements(password: string): boolean {
  return getPasswordRequirements(password).every((r) => r.met)
}

export type PasswordStrength = 'weak' | 'okay' | 'strong'

// A separate, richer scale from the pass/fail requirements above — meeting
// the minimum requirements doesn't necessarily mean the meter shows
// "strong"; length and character variety beyond the minimum push it higher.
export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0
  if (password.length >= PASSWORD_MIN_LENGTH) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return 'weak'
  if (score <= 4) return 'okay'
  return 'strong'
}
