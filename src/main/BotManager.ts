import { AdapterRegistry } from './core/AdapterRegistry'
import { AskulBrowserAdapter } from './core/adapters/AskulBrowserAdapter'
import { GenericHttpAdapter } from './core/adapters/GenericHttpAdapter'
import { TaskEngine, type EngineCallbacks, type EngineOptions } from './core/TaskEngine'

export class BotManager {
  readonly registry: AdapterRegistry
  readonly engine: TaskEngine
  private askulAdapter: AskulBrowserAdapter

  constructor(options: EngineOptions, callbacks: EngineCallbacks) {
    this.registry = new AdapterRegistry()

    // Create Askul browser adapter with logging callback
    this.askulAdapter = new AskulBrowserAdapter({
      onLog: callbacks.onLog
    })

    this.registry.register(this.askulAdapter)
    this.registry.registerFallback(new GenericHttpAdapter())
    this.engine = new TaskEngine(this.registry, options, callbacks, this.askulAdapter)
  }

  async cleanup(): Promise<void> {
    await this.askulAdapter.cleanup()
  }

  // Cleanup a specific task's browser session when stopped
  async cleanupTaskSession(taskId: string): Promise<void> {
    await this.askulAdapter.cleanupTaskSession(taskId)
  }
}
