import { chromium, BrowserContext, Page } from 'playwright'

interface BotWorkerConfig {
  proxy?: string
  url: string
}

// eslint-disable-next-line prettier/prettier
export class BotWorker {
  private browser: BrowserContext | null = null
  private page: Page | null = null

  public isRunning = false

  constructor(
    public taskId: string,
    public config: BotWorkerConfig,
    private sendStatus: (id: string, status: string, msg: string) => void
  ) {}

  async start(): Promise<void> {
    this.isRunning = true
    this.sendStatus(this.taskId, 'RUNNING', 'Initializing Browser...')

    try {
      // 1. Setup Proxy & Browser
      const browser = await chromium.launch({ headless: false }) // Để false để user thấy bot chạy
      this.browser = await browser.newContext({
        proxy: this.config.proxy ? { server: this.config.proxy } : undefined
      })

      this.page = await this.browser.newPage()

      // 2. Logic chính (Ví dụ vào web check hàng)
      this.sendStatus(this.taskId, 'CHECKING', `Visiting ${this.config.url}...`)
      await this.page.goto(this.config.url)

      // --- LOGIC MONITORING ---
      // Nếu bị chặn (403) -> Throw error để bên ngoài catch được và đổi proxy
      const title = await this.page.title()
      if (title.includes('Access Denied')) {
        throw new Error('PROXY_BANNED')
      }

      this.sendStatus(this.taskId, 'SUCCESS', 'Product found!')
    } catch (error: unknown) {
      if (!this.isRunning) return // Nếu user bấm stop thì bỏ qua lỗi

      if (error instanceof Error && error.message === 'PROXY_BANNED') {
        this.sendStatus(this.taskId, 'RETRYING', 'Proxy Banned! Rotating...')
        // Logic đổi proxy sẽ nằm ở lớp quản lý bên trên, ở đây báo lỗi thôi
      } else if (error instanceof Error) {
        this.sendStatus(this.taskId, 'ERROR', error.message)
      } else {
        this.sendStatus(this.taskId, 'ERROR', String(error))
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false
    this.sendStatus(this.taskId, 'IDLE', 'Stopped by user')
    if (this.browser) await this.browser.close()
  }
}
