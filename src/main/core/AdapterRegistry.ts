import type { Adapter } from './adapter'

export class AdapterRegistry {
  private adapters: Adapter[] = []
  private fallback?: Adapter

  register(adapter: Adapter): void {
    this.adapters.push(adapter)
  }

  registerFallback(adapter: Adapter): void {
    this.fallback = adapter
  }

  resolve(url: string): Adapter {
    const found = this.adapters.find((adapter) => adapter.canHandle(url))
    if (found) return found
    if (this.fallback) return this.fallback
    throw new Error(`No adapter registered for ${url}`)
  }

  list(): Adapter[] {
    return [...this.adapters, ...(this.fallback ? [this.fallback] : [])]
  }
}
