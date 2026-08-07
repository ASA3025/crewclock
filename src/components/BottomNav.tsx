import { NavLink } from 'react-router-dom'
import { House, ClockCounterClockwise, CalendarBlank } from '@phosphor-icons/react'

const items = [
  { to: '/worker/home', label: 'Home', icon: House },
  { to: '/worker/hours', label: 'Hours', icon: ClockCounterClockwise },
  { to: '/worker/roster', label: 'Roster', icon: CalendarBlank },
]

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-150 ${
                  isActive ? 'text-accent' : 'text-muted-fg hover:text-fg'
                }`
              }
            >
              <Icon size={22} weight="regular" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
