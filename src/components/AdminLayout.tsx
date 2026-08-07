import { Outlet } from 'react-router-dom'
import { AdminNav } from './AdminNav'

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-bg pb-20 md:pb-0 md:pl-60">
      <AdminNav />
      <Outlet />
    </div>
  )
}
