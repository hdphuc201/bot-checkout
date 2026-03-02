export type TaskStatus =
  | 'IDLE'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'AVAILABLE'
  | 'SUCCESS'
  | 'ERROR'
  | 'STOPPED'
  | 'BACKOFF'

export interface TaskRecord {
  id: string
  name: string | null
  url: string
  siteKey: string | null
  desiredQty: number
  intervalMs: number
  groupName: string | null
  proxyId: string | null
  profileId: string | null
  status: TaskStatus
  lastRunAt: number | null
  lastResult: string | null
  createdAt: number
  updatedAt: number
}

export interface TaskInput {
  id?: string
  name?: string | null
  url: string
  siteKey?: string | null
  desiredQty?: number
  intervalMs?: number
  groupName?: string | null
  proxyId?: string | null
  profileId?: string | null
}

export type ProxyStatus = 'UNCHECKED' | 'ALIVE' | 'DEAD'

export interface ProxyRecord {
  id: string
  host: string
  port: number
  username: string | null
  passwordRef: string | null
  status: ProxyStatus
  lastLatencyMs: number | null
  lastCheckedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ProxyInput {
  id?: string
  host: string
  port: number
  username?: string | null
  password?: string | null
}

export interface ProfileRecord {
  id: string
  name: string
  email: string | null
  phone: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postal: string | null
  country: string | null
  notes: string | null
  secretKeys: string[]
  createdAt: number
  updatedAt: number
}

export interface ProfileInput {
  id?: string
  name: string
  email?: string | null
  phone?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postal?: string | null
  country?: string | null
  notes?: string | null
}

export interface LogRecord {
  id: string
  taskId: string | null
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  meta: Record<string, unknown> | null
  createdAt: number
}

export interface AvailabilityEvent {
  taskId: string
  url: string
  message: string
  actionUrl: string
}

export interface StatusEvent {
  taskId: string
  status: TaskStatus
  message: string
  lastRunAt?: number
}

export interface SiteSettingsRecord {
  id: string
  siteKey: string
  loginUrl: string
  username: string | null
  passwordRef: string | null
  cartUrl: string | null
  checkoutUrl: string | null
  extraConfig: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface SiteSettingsInput {
  id?: string
  siteKey: string
  loginUrl: string
  username?: string | null
  password?: string | null
  cartUrl?: string | null
  checkoutUrl?: string | null
  extraConfig?: Record<string, unknown> | null
}
