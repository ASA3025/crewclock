import { Outlet } from 'react-router-dom'
import { SignOut } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { BottomNav } from './BottomNav'
import { Footer } from './Footer'

export function WorkerLayout() {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-bg pb-20">
      <div className="flex justify-end border-b border-border bg-white px-4 py-2.5">
        <button
          onClick={() => signOut()}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-fg transition-colors duration-150 hover:bg-muted hover:text-fg"
        >
          <SignOut size={18} weight="regular" />
          Log out
        </button>
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
      <BottomNav />
    </div>
  )
}
