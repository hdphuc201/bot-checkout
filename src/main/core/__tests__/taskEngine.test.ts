import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AdapterRegistry } from '../AdapterRegistry'
import type { Adapter } from '../adapter'
import type { AvailabilityEvent, StatusEvent, TaskRecord } from '../../../shared/types'

const tasks = vi.hoisted(() => [] as TaskRecord[])

const taskStoreMock = vi.hoisted(() => ({
  list: () => tasks,
  get: (id: string) => tasks.find((task) => task.id === id) ?? null,
  update: (id: string, patch: Partial<TaskRecord>) => {
    const index = tasks.findIndex((task) => task.id === id)
    if (index === -1) throw new Error('Task not found')
    const updated = { ...tasks[index], ...patch, updatedAt: Date.now() } as TaskRecord
    tasks[index] = updated
    return updated
  }
}))

const proxyStoreMock = vi.hoisted(() => ({
  list: () => []
}))

vi.mock('../../db', () => ({
  taskStore: taskStoreMock,
  proxyStore: proxyStoreMock
}))

vi.mock('../../services/secretService', () => ({
  getSecret: vi.fn().mockResolvedValue(null)
}))

import { TaskEngine } from '../TaskEngine'

describe('TaskEngine', () => {
  beforeEach(() => {
    tasks.splice(0, tasks.length)
    tasks.push({
      id: 'task-1',
      name: 'Test Task',
      url: 'https://example.com',
      siteKey: null,
      desiredQty: 1,
      intervalMs: 5000,
      groupName: null,
      proxyId: null,
      profileId: null,
      status: 'IDLE',
      lastRunAt: null,
      lastResult: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  })

  it('emits availability when adapter reports available', async () => {
    const adapter: Adapter = {
      id: 'test',
      label: 'Test Adapter',
      canHandle: () => true,
      checkAvailability: async () => ({
        available: true,
        message: 'AVAILABLE',
        actionUrl: 'https://example.com'
      }),
      renderHumanAction: () => 'Open URL'
    }

    const registry = new AdapterRegistry()
    registry.registerFallback(adapter)

    const availabilityEvents: AvailabilityEvent[] = []
    const statusEvents: StatusEvent[] = []

    const engine = new TaskEngine(
      registry,
      {
        concurrency: 1,
        rateLimitMinTime: 1,
        rateLimitMaxConcurrent: 1,
        retryCount: 0,
        retryBaseDelayMs: 10
      },
      {
        onAvailability: (event) => availabilityEvents.push(event),
        onStatus: (event) => statusEvents.push(event)
      }
    )

    engine.startTask('task-1')
    await new Promise((resolve) => setTimeout(resolve, 30))
    engine.stopAll()

    expect(availabilityEvents.length).toBe(1)
    expect(statusEvents.some((event) => event.status === 'AVAILABLE')).toBe(true)
  })
})
