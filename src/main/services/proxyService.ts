import { fetch, ProxyAgent } from 'undici'
import { proxyStore } from '../db'
import type { ProxyRecord } from '../../shared/types'
import { getSecret } from './secretService'
import PQueue from 'p-queue'

export interface ProxyCheckResult {
  id: string
  status: 'ALIVE' | 'DEAD'
  latencyMs: number | null
  error?: string
}

export async function checkProxy(
  proxy: ProxyRecord,
  endpoint: string,
  timeoutMs = 8000
): Promise<ProxyCheckResult> {
  const start = Date.now()
  try {
    let password: string | null = null
    if (proxy.passwordRef) {
      password = await getSecret(proxy.passwordRef)
    }

    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(password ?? '')}@`
      : ''
    const proxyUrl = `http://${auth}${proxy.host}:${proxy.port}`
    const agent = new ProxyAgent(proxyUrl)

    const response = await fetch(endpoint, {
      dispatcher: agent,
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs)
    })

    const latencyMs = Date.now() - start
    const status = response.ok ? 'ALIVE' : 'DEAD'

    return { id: proxy.id, status, latencyMs }
  } catch (error) {
    return {
      id: proxy.id,
      status: 'DEAD',
      latencyMs: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function checkAllProxies(
  endpoint: string,
  timeoutMs = 8000
): Promise<ProxyCheckResult[]> {
  const proxies = proxyStore.list()
  const PQueueCtor =
    (PQueue as unknown as { default?: typeof PQueue }).default ?? (PQueue as typeof PQueue)
  const queue = new PQueueCtor({ concurrency: 10 })
  const results = await Promise.all(
    proxies.map((proxy) =>
      queue.add<ProxyCheckResult>(async () => {
        const result = await checkProxy(proxy, endpoint, timeoutMs)
        proxyStore.update(proxy.id, {
          status: result.status,
          lastLatencyMs: result.latencyMs,
          lastCheckedAt: Date.now()
        })
        return result
      })
    )
  )

  return results.filter((result): result is ProxyCheckResult => Boolean(result))
}
