import { describe, expect, it } from 'vitest'
import { AdapterRegistry } from '../AdapterRegistry'
import type { Adapter } from '../adapter'

const adapterA: Adapter = {
  id: 'a',
  label: 'A',
  canHandle: (url) => url.includes('alpha'),
  checkAvailability: async () => ({ available: false, message: 'noop' }),
  renderHumanAction: () => 'none'
}

const adapterB: Adapter = {
  id: 'b',
  label: 'B',
  canHandle: (url) => url.includes('beta'),
  checkAvailability: async () => ({ available: false, message: 'noop' }),
  renderHumanAction: () => 'none'
}

const fallback: Adapter = {
  id: 'fallback',
  label: 'Fallback',
  canHandle: () => true,
  checkAvailability: async () => ({ available: false, message: 'noop' }),
  renderHumanAction: () => 'none'
}

describe('AdapterRegistry', () => {
  it('resolves adapters by canHandle', () => {
    const registry = new AdapterRegistry()
    registry.register(adapterA)
    registry.register(adapterB)
    registry.registerFallback(fallback)

    expect(registry.resolve('https://alpha.com').id).toBe('a')
    expect(registry.resolve('https://beta.com').id).toBe('b')
    expect(registry.resolve('https://other.com').id).toBe('fallback')
  })
})
