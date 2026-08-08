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
  address: string | null
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

export interface WorkerNote {
  id: string
  user_id: string
  business_id: string
  shift_id: string | null
  roster_entry_id: string | null
  message: string
  resolved: boolean
  created_at: string
}

export interface WorkerNoteWithContext extends WorkerNote {
  users: Pick<AppUser, 'id' | 'name'>
  shifts: Pick<Shift, 'clock_in_time'> | null
  roster_entries: Pick<RosterEntry, 'date' | 'location_label'> | null
}

export interface WorkerNoteReply {
  id: string
  worker_note_id: string
  business_id: string
  author_id: string
  author_name: string
  author_role: Role
  message: string
  created_at: string
}
