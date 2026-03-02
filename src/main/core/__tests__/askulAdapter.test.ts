import { describe, expect, it } from 'vitest'
import { classifyAskulHtml } from '../adapters/AskulAdapter'

describe('classifyAskulHtml', () => {
  it('marks out of stock for page unavailable banner', () => {
    const html =
      '<h2>\u3053\u3061\u3089\u306e\u30da\u30fc\u30b8\u306f\u73fe\u5728\u3054\u5229\u7528\u3067\u304d\u307e\u305b\u3093</h2>'
    const result = classifyAskulHtml(html, 'https://www.askul.co.jp/p/RK90736/', 200)
    expect(result.available).toBe(false)
    expect(result.message).toBe('OUT_OF_STOCK')
  })

  it('marks unavailable for out of stock marker', () => {
    const html =
      '<div>\u73fe\u5728\u3054\u6ce8\u6587\u3044\u305f\u3060\u3051\u307e\u305b\u3093</div>'
    const result = classifyAskulHtml(html, 'https://www.askul.co.jp/p/TEST/', 200)
    expect(result.available).toBe(false)
    expect(result.message).toBe('OUT_OF_STOCK')
  })

  it('marks available for in stock marker', () => {
    const html =
      '<span>\u5728\u5eab\uff1a\u3042\u308a</span><button>\u30ab\u30b4\u306b\u5165\u308c\u308b</button>'
    const result = classifyAskulHtml(html, 'https://www.askul.co.jp/p/WAR3059/', 200)
    expect(result.available).toBe(true)
    expect(result.message).toBe('AVAILABLE')
  })

  it('returns unknown when no markers match', () => {
    const html = '<html><body>no markers</body></html>'
    const result = classifyAskulHtml(html, 'https://www.askul.co.jp/p/UNKNOWN/', 200)
    expect(result.available).toBe(false)
    expect(result.message).toBe('UNKNOWN')
  })
})
