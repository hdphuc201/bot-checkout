import type { TaskRecord } from '../../shared/types'

export interface AvailabilityResult {
  available: boolean
  message: string
  actionUrl?: string
}

export interface AdapterContext {
  task: TaskRecord
  proxy?: string | null
}

export interface Adapter {
  id: string
  label: string
  canHandle(url: string): boolean
  checkAvailability(ctx: AdapterContext): Promise<AvailabilityResult>
  renderHumanAction(ctx: AdapterContext): string
  // Optional cleanup methods for browser-based adapters
  cleanup?(): Promise<void>
  cleanupTaskSession?(taskId: string): Promise<void>
}
