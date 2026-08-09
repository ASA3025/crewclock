import { NavLink, Link } from 'react-router-dom'
import {
  SquaresFour,
  ClockCounterClockwise,
  CalendarBlank,
  Download,
  Flag,
  Airplane,
  UsersThree,
  SignOut,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'

const items = [
  { to: '/admin/overview', label: 'Overview', icon: SquaresFour },
  { to: '/admin/hours', label: 'Hours', icon: ClockCounterClockwise },
  { to: '/admin/roster', label: 'Roster', icon: CalendarBlank },
  { to: '/admin/flags', label: 'Flags', icon: Flag },
  { to: '/admin/leave', label: 'Leave', icon: Airplane },
  { to: '/admin/export', label: 'Export', icon: Download },
  { to: '/admin/workers', label: 'Workers', icon: UsersThree },
]

export function AdminNav() {
  const { appUser, signOut } = useAuth()

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-white md:flex">
        <div className="border-b border-border px-6 py-5">
          <Link to="/" className="font-heading text-lg font-bold text-navy">
            Crewclock
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-fg">{appUser?.name}</p>
        </div>
        <ul className="flex flex-1 flex-col gap-1 p-3">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                    isActive ? 'bg-navy text-navy-fg' : 'text-fg hover:bg-muted'
                  }`
                }
              >
                <Icon size={20} weight="regular" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <button
          onClick={() => signOut()}
          className="mx-3 mb-4 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
        >
          <SignOut size={20} weight="regular" />
          Log out
        </button>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="flex">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150 ${
                    isActive ? 'text-accent' : 'text-muted-fg hover:text-fg'
                  }`
                }
              >
                <Icon size={20} weight="regular" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
