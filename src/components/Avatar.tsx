import type { AppUser } from '../types'

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function Avatar({
  worker,
  size = 40,
}: {
  worker: Pick<AppUser, 'name' | 'avatar_url'>
  size?: number
}) {
  if (worker.avatar_url) {
    return (
      <img
        src={worker.avatar_url}
        alt={worker.name}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-border object-cover"
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-semibold text-muted-fg"
    >
      {initials(worker.name)}
    </div>
  )
}
