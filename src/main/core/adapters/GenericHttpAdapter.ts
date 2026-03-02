import { fetch, ProxyAgent } from 'undici'
import type { Adapter, AdapterContext, AvailabilityResult } from '../adapter'

export class GenericHttpAdapter implements Adapter {
  id = 'generic-http'
  label = 'Generic HTTP'

  canHandle(): boolean {
    return true
  }

  async checkAvailability(ctx: AdapterContext): Promise<AvailabilityResult> {
    const agent = ctx.proxy ? new ProxyAgent(ctx.proxy) : undefined

    const response = await fetch(ctx.task.url, {
      method: 'GET',
      dispatcher: agent,
      signal: AbortSignal.timeout(12000)
    })

    const body = await response.text()
    const soldOut = /sold out|out of stock|unavailable/i.test(body)
    const available = response.ok && !soldOut

    return {
      available,
      message: available ? 'AVAILABLE' : 'Not available',
      actionUrl: ctx.task.url
    }
  }

  renderHumanAction(ctx: AdapterContext): string {
    return `Open ${ctx.task.url} in browser to complete the flow.`
  }
}
