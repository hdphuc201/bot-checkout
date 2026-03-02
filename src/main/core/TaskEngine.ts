import Bottleneck from 'bottleneck'
import PQueue from 'p-queue'
import pRetry from 'p-retry'
import type { AvailabilityEvent, StatusEvent, TaskRecord, TaskStatus } from '../../shared/types'
import type { AdapterRegistry } from './AdapterRegistry'
import type { AskulBrowserAdapter } from './adapters/AskulBrowserAdapter'
import { taskStore, proxyStore } from '../db'
import { getSecret } from '../services/secretService'

const pRetryFn =
  (pRetry as unknown as { default?: typeof pRetry }).default ?? (pRetry as typeof pRetry)

export interface EngineOptions {
  concurrency: number
  rateLimitMinTime: number
  rateLimitMaxConcurrent: number
  retryCount: number
  retryBaseDelayMs: number
}

export interface EngineCallbacks {
  onStatus?: (event: StatusEvent) => void
  onAvailability?: (event: AvailabilityEvent) => void
  onLog?: (
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>
  ) => void
  notify?: (title: string, body: string, actionUrl: string) => void
}

export class TaskEngine {
  private readonly queue: PQueue
  private readonly limiter: Bottleneck
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private readonly runningTasks = new Set<string>() // Track currently running tasks
  private readonly options: EngineOptions
  private readonly registry: AdapterRegistry
  private readonly callbacks: EngineCallbacks
  private readonly browserAdapter?: AskulBrowserAdapter // Reference to browser adapter for cleanup

  constructor(
    registry: AdapterRegistry,
    options: EngineOptions,
    callbacks: EngineCallbacks = {},
    browserAdapter?: AskulBrowserAdapter
  ) {
    const PQueueCtor =
      (PQueue as unknown as { default?: typeof PQueue }).default ?? (PQueue as typeof PQueue)
    this.registry = registry
    this.options = options
    this.callbacks = callbacks
    this.browserAdapter = browserAdapter
    this.queue = new PQueueCtor({ concurrency: options.concurrency })
    this.limiter = new Bottleneck({
      minTime: options.rateLimitMinTime,
      maxConcurrent: options.rateLimitMaxConcurrent
    })
  }

  startAll(): void {
    const tasks = taskStore.list()
    tasks.forEach((task) => this.scheduleTask(task))
  }

  stopAll(): void {
    for (const [taskId, timer] of this.timers.entries()) {
      clearInterval(timer)
      this.timers.delete(taskId)
      this.runningTasks.delete(taskId)
      this.updateStatus(taskId, 'STOPPED', 'Stopped by user')
      // Cleanup browser session for this task
      this.browserAdapter?.cleanupTaskSession(taskId).catch(() => {})
    }
  }

  startTask(taskId: string): void {
    const task = taskStore.get(taskId)
    if (!task) return
    this.scheduleTask(task)
  }

  stopTask(taskId: string): void {
    const timer = this.timers.get(taskId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(taskId)
    }
    this.runningTasks.delete(taskId)
    this.updateStatus(taskId, 'STOPPED', 'Stopped by user')
    // Cleanup browser session for this task
    this.browserAdapter?.cleanupTaskSession(taskId).catch(() => {})
    this.callbacks.onLog?.('info', `Task ${taskId} stopped and browser session cleaned up`)
  }

  private scheduleTask(task: TaskRecord): void {
    if (this.timers.has(task.id)) return

    const run = (): void => {
      // Check if task was stopped before running
      if (!this.timers.has(task.id)) {
        return // Task was stopped, don't run
      }
      void this.enqueue(task.id)
    }

    this.updateStatus(task.id, 'SCHEDULED', 'Scheduled')
    this.runningTasks.add(task.id)
    run()
    const timer = setInterval(run, Math.max(1000, task.intervalMs))
    this.timers.set(task.id, timer)
  }

  private async enqueue(taskId: string): Promise<void> {
    // Check if task was stopped
    if (!this.timers.has(taskId)) {
      return // Task was stopped, don't enqueue
    }

    const task = taskStore.get(taskId)
    if (!task) return

    await this.queue.add(() => this.limiter.schedule(() => this.execute(task)))
  }

  private async execute(task: TaskRecord): Promise<void> {
    // Check if task was stopped before executing
    if (!this.timers.has(task.id)) {
      this.callbacks.onLog?.('debug', `Task ${task.id} was stopped, skipping execution`)
      return
    }

    const adapter = this.registry.resolve(task.url)
    const proxyUrl = await this.resolveProxy(task)

    this.updateStatus(task.id, 'RUNNING', `Checking via ${adapter.label}`)

    try {
      const result = await pRetryFn(() => adapter.checkAvailability({ task, proxy: proxyUrl }), {
        retries: this.options.retryCount,
        minTimeout: this.options.retryBaseDelayMs,
        factor: 2,
        onFailedAttempt: (error) => {
          // Check if task was stopped during retry
          if (!this.timers.has(task.id)) {
            throw new Error('Task stopped')
          }
          this.updateStatus(
            task.id,
            'BACKOFF',
            `Retry ${error.attemptNumber}/${this.options.retryCount}`
          )
        }
      })

      // Check if task was stopped during execution
      if (!this.timers.has(task.id)) {
        return
      }

      const nextStatus: TaskStatus = result.available ? 'AVAILABLE' : 'IDLE'
      const message = result.available ? 'AVAILABLE' : result.message

      this.updateStatus(task.id, nextStatus, message)
      taskStore.update(task.id, { lastRunAt: Date.now(), lastResult: message })

      if (result.available) {
        const event: AvailabilityEvent = {
          taskId: task.id,
          url: result.actionUrl || task.url,
          message: adapter.renderHumanAction({ task, proxy: proxyUrl }),
          actionUrl: result.actionUrl || task.url
        }
        this.callbacks.onAvailability?.(event)
        this.callbacks.notify?.(
          'Automation Console',
          `AVAILABLE: ${task.name ?? task.url}`,
          event.actionUrl
        )
      }

      this.callbacks.onLog?.('info', 'Task check completed', {
        taskId: task.id,
        status: nextStatus,
        adapter: adapter.id
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.updateStatus(task.id, 'ERROR', message)
      this.callbacks.onLog?.('error', 'Task check failed', { taskId: task.id, error: message })
    }
  }

  private updateStatus(taskId: string, status: TaskStatus, message: string): void {
    taskStore.update(taskId, { status, lastResult: message })
    this.callbacks.onStatus?.({ taskId, status, message, lastRunAt: Date.now() })
  }

  private async resolveProxy(task: TaskRecord): Promise<string | null> {
    if (!task.proxyId) return null
    const proxy = proxyStore.list().find((item) => item.id === task.proxyId)
    if (!proxy) return null

    let password: string | null = null
    if (proxy.passwordRef) {
      password = await getSecret(proxy.passwordRef)
    }

    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(password ?? '')}@`
      : ''

    return `http://${auth}${proxy.host}:${proxy.port}`
  }
}
