import { Outlet } from 'react-router-dom'
import { SignOut } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { AdminNav } from './AdminNav'
import { Footer } from './Footer'

export function AdminLayout() {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-bg pb-20 md:pb-0 md:pl-60">
      {/* Desktop has its own Log out button in AdminNav's sidebar — this
          bar only needs to exist on mobile, where the bottom nav has no
          room left for it now that it's grown to 7 destinations. */}
      <div className="flex justify-end border-b border-border bg-white px-4 py-2.5 md:hidden">
        <button
          onClick={() => signOut()}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
        >
          <SignOut size={18} weight="regular" />
          Log out
        </button>
      </div>
      <AdminNav />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
