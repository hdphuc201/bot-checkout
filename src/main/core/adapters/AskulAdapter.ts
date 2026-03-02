import { fetch, ProxyAgent } from 'undici'
import type { Adapter, AdapterContext, AvailabilityResult } from '../adapter'

const MARKER_PAGE_UNAVAILABLE =
  '\u3053\u3061\u3089\u306e\u30da\u30fc\u30b8\u306f\u73fe\u5728\u3054\u5229\u7528\u3067\u304d\u307e\u305b\u3093'
const MARKER_OUT_OF_STOCK =
  '\u73fe\u5728\u3054\u6ce8\u6587\u3044\u305f\u3060\u3051\u307e\u305b\u3093'

const OUT_OF_STOCK_MARKERS = [
  MARKER_OUT_OF_STOCK,
  '\u5165\u8377\u5f85\u3061',
  '\u5728\u5eab\uff1a\u306a\u3057',
  '\u5728\u5eab\u306a\u3057',
  '\u8ca9\u58f2\u7d42\u4e86',
  '\u8ca9\u58f2\u505c\u6b62',
  '\u53d6\u6271\u7d42\u4e86'
]

const AVAILABLE_MARKERS = [
  '\u5728\u5eab\uff1a\u3042\u308a',
  '\u5728\u5eab\u3042\u308a',
  '\u30ab\u30b4\u306b\u5165\u308c\u308b',
  '\u6ce8\u6587\u3059\u308b',
  '\u6b8b\u308a\u308f\u305a\u304b'
]

function includesAny(body: string, markers: string[]): boolean {
  return markers.some((marker) => body.includes(marker))
}

export function classifyAskulHtml(body: string, url: string, status: number): AvailabilityResult {
  const actionUrl = url

  if (status >= 400) {
    return { available: false, message: `HTTP_${status}`, actionUrl }
  }

  if (body.includes(MARKER_PAGE_UNAVAILABLE)) {
    return { available: false, message: 'OUT_OF_STOCK', actionUrl }
  }

  if (includesAny(body, OUT_OF_STOCK_MARKERS)) {
    return { available: false, message: 'OUT_OF_STOCK', actionUrl }
  }

  if (includesAny(body, AVAILABLE_MARKERS)) {
    return { available: true, message: 'AVAILABLE', actionUrl }
  }

  return { available: false, message: 'UNKNOWN', actionUrl }
}

export class AskulAdapter implements Adapter {
  id = 'askul'
  label = 'Askul (JP)'

  canHandle(url: string): boolean {
    try {
      return /(^|\.)askul\.co\.jp$/i.test(new URL(url).hostname)
    } catch {
      return false
    }
  }

  async checkAvailability(ctx: AdapterContext): Promise<AvailabilityResult> {
    const agent = ctx.proxy ? new ProxyAgent(ctx.proxy) : undefined

    const response = await fetch(ctx.task.url, {
      method: 'GET',
      dispatcher: agent,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ja-JP,ja;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(12000)
    })

    const body = await response.text()
    return classifyAskulHtml(body, ctx.task.url, response.status)
  }

  renderHumanAction(ctx: AdapterContext): string {
    return `Open ${ctx.task.url} in browser to complete the flow.`
  }
}
