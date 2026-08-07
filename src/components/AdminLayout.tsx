import { Outlet } from 'react-router-dom'
import { AdminNav } from './AdminNav'
import { Footer } from './Footer'

export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg pb-20 md:pb-0 md:pl-60">
      <AdminNav />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
