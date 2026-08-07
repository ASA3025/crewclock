export type Role = 'admin' | 'worker'

export interface Business {
  id: string
  name: string
  created_at: string
}

export interface AppUser {
  id: string
  auth_id: string
  name: string
  email: string
  role: Role
  business_id: string
  hourly_rate: number | null
  created_at: string
}

export interface Shift {
  id: string
  user_id: string
  business_id: string
  clock_in_time: string
  clock_out_time: string | null
  gps_lat: number | null
  gps_lng: number | null
  note: string | null
  photo_url: string | null
  approved: boolean
  rejected: boolean
  created_at: string
}

export interface ShiftWithWorker extends Shift {
  users: Pick<AppUser, 'id' | 'name' | 'email' | 'hourly_rate'>
}

export interface RosterEntry {
  id: string
  user_id: string
  business_id: string
  date: string
  location_label: string
  start_time: string | null
  end_time: string | null
  created_at: string
}

export interface RosterEntryWithWorker extends RosterEntry {
  users: Pick<AppUser, 'id' | 'name'>
}
