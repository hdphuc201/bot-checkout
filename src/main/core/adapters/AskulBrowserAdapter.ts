import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { Adapter, AdapterContext, AvailabilityResult } from '../adapter'
import { siteSettingsStore } from '../../db'
import { getSecret } from '../../services/secretService'
import { captchaService } from '../../services/captchaService'

const ASKUL_SITE_KEY = 'askul'

// Askul reCAPTCHA site keys - the site uses v2 explicit render
// New site key found in login page (explicit render mode)
const ASKUL_RECAPTCHA_V2_SITE_KEY = '6Lc1IWEoAAAAABIZVc4L1-2SDeySVWmIf_8E6H_d'

// Askul URL patterns
const ASKUL_URLS = {
  login: 'https://www.askul.co.jp/webapp/shops-club/servlet/YLogonSSLView',
  cart: 'https://www.askul.co.jp/odr/order/shoppingCartView/',
  checkout: 'https://www.askul.co.jp/odr/order/orderProcessView/',
  orderComplete: 'https://www.askul.co.jp/odr/order/orderCompleteView/',
  // Order details page after processing (takes ~20s to generate)
  orderProcessComplete: 'https://www.askul.co.jp/odr/order/orderProcessCompleteView/?payRoute=2'
}

// Selectors for Askul pages - based on actual HTML structure
const SELECTORS = {
  login: {
    // From login.html: input[name="loginId"] id="login_id"
    emailInput: '#login_id, input[name="loginId"]',
    // From login.html: input[name="pass"] id="login_pw"
    passwordInput: '#login_pw, input[name="pass"]',
    // From login.html: input.login_btn with onclick="onClick(event)"
    submitButton: 'input.login_btn, input[value="ログイン"], button:has-text("ログイン")'
  },
  product: {
    // From product.html: <span class="m-btn_text">カゴに入れる</span>
    addToCartButton:
      '.m-btn_text:has-text("カゴに入れる"), button:has(.m-btn_text), button[onclick*="addCart"]',
    // From product.html: select[data-cart-quantity="select"] or input[data-cart-quantity="input"]
    quantitySelect: 'select[data-cart-quantity="select"]',
    quantityInput: 'input[data-cart-quantity="input"], input.a-textinput_input',
    // Stock status selectors - use CSS selectors instead of text matching
    stockStatusGreen: '.m-variationitemcard_stock.-green, span.a-span.u-text-darkgreen.u-text-bold',
    stockStatusRed: '.m-variationitemcard_stock.-red',
    outOfStockTexts: [
      '現在ご注文いただけません',
      '入荷待ち',
      '販売終了',
      '販売停止',
      '取扱終了',
      '取り扱い終了'
    ]
  },
  cart: {
    // From shoppingcart.html: <a class="bsk1712-btn bsk1712-btn-orange" onclick="orderProcess()...">レジへ<span>（ご注文の確認）</span></a>
    proceedToCheckout:
      'a.bsk1712-btn-orange[onclick*="orderProcess"], a.bsk1712-btn-orange:has-text("レジへ")',
    cartItems: '.bsk1712-inCart__in, .cart-item, .cartItem'
  },
  checkout: {
    // From payment.html: #paymentCredit for credit card radio
    creditCardRadio: '#paymentCredit, input[name="paymentMethod"][value*="credit"]',
    // First confirm button - opens modal: <a class="js-opnModal" mt:id="SUBMIT_TO_COMPLETE_TAG">
    firstConfirmButton:
      'a.js-opnModal[mt\\:id="SUBMIT_TO_COMPLETE_TAG"], a.reg1712-btn-orange.js-opnModal:has-text("ご注文確定")',
    // Checkbox for delivery location agreement: 置き場所指定確認事項に同意する
    agreementCheckbox:
      'label.reg1712-checkbox:has-text("置き場所指定確認事項に同意する") input[type="checkbox"], label:has-text("置き場所指定確認事項に同意する") input',
    // Final confirm button - submits order: <a class="js-confirmOrder" onclick="submitAll...">
    finalConfirmButton:
      'a.js-confirmOrder[onclick*="submitAll"], a.reg1712-btn-orange.js-confirmOrder:has-text("ご注文確定")',
    // Security code input for credit card
    securityCodeInput: '#securityCodeInput, input[name="securityCode"]',
    orderComplete: ':has-text("ご注文ありがとう"), :has-text("注文完了")'
  }
}

// Configurable wait times (in milliseconds) - adjust these to speed up or slow down
const WAIT_TIMES = {
  pageLoad: 300, // Sau khi page load xong
  afterInput: 100, // Sau khi điền input
  afterClick: 500, // Sau khi click button
  loginProcess: 800, // Chờ login/reCAPTCHA xử lý
  navigation: 300 // Sau khi chuyển trang
}

export interface AskulBrowserAdapterCallbacks {
  onLog?: (
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>
  ) => void
}

// Session data per task to avoid conflicts between multiple tasks
interface TaskSession {
  context: BrowserContext
  page: Page
  isLoggedIn: boolean
  lastUsed: number
  orderCompleted: boolean // Flag to track if order was completed (run only once)
}

export class AskulBrowserAdapter implements Adapter {
  id = 'askul-browser'
  label = 'Askul Browser (JP)'

  private browser: Browser | null = null
  private sessions = new Map<string, TaskSession>() // taskId -> session
  private callbacks: AskulBrowserAdapterCallbacks
  private sessionCleanupInterval: NodeJS.Timeout | null = null
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

  constructor(callbacks: AskulBrowserAdapterCallbacks = {}) {
    this.callbacks = callbacks
    // Start cleanup interval for idle sessions
    this.sessionCleanupInterval = setInterval(() => this.cleanupIdleSessions(), 5 * 60 * 1000)
  }

  canHandle(url: string): boolean {
    try {
      return /(^|\.)askul\.co\.jp$/i.test(new URL(url).hostname)
    } catch {
      return false
    }
  }

  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>
  ): void {
    this.callbacks.onLog?.(level, `[AskulBrowser] ${message}`, meta)
  }

  // Clean up sessions that have been idle for too long
  private cleanupIdleSessions(): void {
    const now = Date.now()
    for (const [taskId, session] of this.sessions.entries()) {
      if (now - session.lastUsed > this.SESSION_TIMEOUT_MS) {
        this.log('debug', `Cleaning up idle session for task ${taskId}`)
        session.page.close().catch(() => {})
        session.context.close().catch(() => {})
        this.sessions.delete(taskId)
      }
    }
  }

  // Get or create a session for a specific task
  private async getOrCreateSession(taskId: string, proxyUrl?: string | null): Promise<TaskSession> {
    // Check if session exists and is still valid
    const existing = this.sessions.get(taskId)
    if (existing) {
      try {
        if (!existing.page.isClosed()) {
          existing.lastUsed = Date.now()
          return existing
        }
      } catch {
        // Session invalid
      }
      // Clean up invalid session
      await existing.context.close().catch(() => {})
      this.sessions.delete(taskId)
    }

    // Create browser if needed
    await this.initBrowser(proxyUrl)

    // Create new context and page for this task
    const context = await this.browser!.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport: { width: 1280, height: 800 }
    })

    const page = await context.newPage()
    const session: TaskSession = {
      context,
      page,
      isLoggedIn: false,
      lastUsed: Date.now(),
      orderCompleted: false // Initialize as not completed
    }

    this.sessions.set(taskId, session)
    this.log('info', `Created new session for task ${taskId}`)
    return session
  }

  private async initBrowser(proxyUrl?: string | null): Promise<void> {
    // Check if browser is still connected
    if (this.browser) {
      try {
        if (this.browser.isConnected()) {
          return
        }
      } catch {
        // Browser crashed or disconnected
      }
      // Browser not connected, cleanup and create new
      await this.cleanup()
    }

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: false, // Set to true for production
      args: ['--disable-blink-features=AutomationControlled']
    }

    if (proxyUrl) {
      const proxyParts = new URL(proxyUrl)
      launchOptions.proxy = {
        server: `${proxyParts.protocol}//${proxyParts.hostname}:${proxyParts.port}`,
        username: proxyParts.username || undefined,
        password: proxyParts.password || undefined
      }
      this.log('info', `Using proxy: ${proxyParts.hostname}:${proxyParts.port}`)
    }

    this.browser = await chromium.launch(launchOptions)
    this.log('info', 'Browser initialized')
  }

  private async login(session: TaskSession): Promise<boolean> {
    const page = session.page
    if (session.isLoggedIn) return true

    const settings = siteSettingsStore.getBySiteKey(ASKUL_SITE_KEY)
    if (!settings || !settings.username) {
      this.log('warn', 'No Askul credentials configured')
      return false
    }

    let password: string | null = null
    if (settings.passwordRef) {
      password = await getSecret(settings.passwordRef)
    }

    if (!password) {
      this.log('warn', 'No password found for Askul account')
      return false
    }

    this.log('info', `Logging in as ${settings.username}`)

    try {
      await page.goto(settings.loginUrl || ASKUL_URLS.login, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(WAIT_TIMES.pageLoad) // Wait for page to fully render

      // Wait for login form to be visible
      await page.waitForSelector('#login_id, input[name="loginId"]', { timeout: 2000 })
      this.log('debug', 'Login form found')

      // Fill email/login ID - use direct selector first
      // IMPORTANT: Clear the field first to avoid duplicate input
      const emailInput = page.locator('#login_id').first()
      if (await emailInput.isVisible({ timeout: 3000 })) {
        await emailInput.click()
        await emailInput.clear() // Clear any existing value
        await emailInput.fill(settings.username)
        this.log('debug', 'Email filled')
      } else {
        // Fallback to other selectors
        const emailSelectors = SELECTORS.login.emailInput.split(', ')
        let emailFilled = false
        for (const selector of emailSelectors) {
          try {
            const input = page.locator(selector).first()
            if (await input.isVisible({ timeout: 1000 })) {
              await input.click()
              await input.clear() // Clear any existing value
              await input.fill(settings.username)
              emailFilled = true
              break
            }
          } catch {
            continue
          }
        }
        if (!emailFilled) {
          this.log('error', 'Could not find email input')
          return false
        }
      }

      await page.waitForTimeout(WAIT_TIMES.afterInput)

      // Fill password - use direct selector first
      // IMPORTANT: Clear the field first to avoid duplicate input
      const passwordInput = page.locator('#login_pw').first()
      if (await passwordInput.isVisible({ timeout: 2000 })) {
        await passwordInput.click()
        await passwordInput.clear() // Clear any existing value
        await passwordInput.fill(password)
        this.log('debug', 'Password filled')
      } else {
        // Fallback to other selectors
        const passwordSelectors = SELECTORS.login.passwordInput.split(', ')
        let passwordFilled = false
        for (const selector of passwordSelectors) {
          try {
            const input = page.locator(selector).first()
            if (await input.isVisible({ timeout: 1000 })) {
              await input.click()
              await input.clear() // Clear any existing value
              await input.fill(password)
              passwordFilled = true
              break
            }
          } catch {
            continue
          }
        }
        if (!passwordFilled) {
          this.log('error', 'Could not find password input')
          return false
        }
      }

      await page.waitForTimeout(WAIT_TIMES.afterInput)
      this.log('debug', 'Credentials entered, checking for reCAPTCHA...')

      // =========================================================
      // Handle reCAPTCHA v2 (Askul uses explicit render mode)
      // The captcha renders into div#recaptcha and button is disabled until solved
      // =========================================================
      let recaptchaSolved = false

      // Check if there's a reCAPTCHA v2 widget on the page (explicit render)
      const hasRecaptchaWidget = await page.evaluate(() => {
        return !!(
          document.getElementById('recaptcha') ||
          document.querySelector('.g-recaptcha') ||
          document.querySelector('iframe[src*="recaptcha"]')
        )
      })

      if (hasRecaptchaWidget && captchaService.isConfigured()) {
        this.log('info', 'reCAPTCHA v2 widget detected, solving with CapSolver...')

        // Get the site key from the page or use the known one
        const siteKey = await page.evaluate(() => {
          // Try to get from data-sitekey attribute
          const recaptchaDiv = document.querySelector('.g-recaptcha, [data-sitekey]')
          if (recaptchaDiv?.getAttribute('data-sitekey')) {
            return recaptchaDiv.getAttribute('data-sitekey')
          }
          // Try to get from grecaptcha config (for explicit render)
          // @ts-ignore
          if (window.grecaptcha?.getResponse) {
            // Look for site key in script or page content
            const scripts = document.querySelectorAll('script')
            for (const script of scripts) {
              const match = script.textContent?.match(/'sitekey'\s*:\s*["']([^"']+)["']/)
              if (match) return match[1]
            }
          }
          return null
        })

        const finalSiteKey = siteKey || ASKUL_RECAPTCHA_V2_SITE_KEY
        this.log('info', `Using reCAPTCHA site key: ${finalSiteKey}`)

        // Solve reCAPTCHA v2 using CapSolver
        const captchaResult = await captchaService.solveRecaptchaV2(finalSiteKey, page.url(), false)

        if (captchaResult.success && captchaResult.token) {
          this.log('info', 'reCAPTCHA v2 solved successfully by CapSolver!')

          // Inject the token into the page
          await page.evaluate((token) => {
            // Method 1: Set g-recaptcha-response textarea (standard)
            const textarea = document.querySelector(
              'textarea[name="g-recaptcha-response"], #g-recaptcha-response'
            ) as HTMLTextAreaElement
            if (textarea) {
              textarea.value = token
              textarea.style.display = 'block'
            }

            // Method 2: Create textarea if not exists (for explicit render)
            if (!textarea) {
              const recaptchaDiv = document.getElementById('recaptcha')
              if (recaptchaDiv) {
                let newTextarea = recaptchaDiv.querySelector(
                  'textarea[name="g-recaptcha-response"]'
                ) as HTMLTextAreaElement
                if (!newTextarea) {
                  newTextarea = document.createElement('textarea')
                  newTextarea.name = 'g-recaptcha-response'
                  newTextarea.id = 'g-recaptcha-response'
                  newTextarea.style.display = 'none'
                  recaptchaDiv.appendChild(newTextarea)
                }
                newTextarea.value = token
              }
            }

            // Method 3: Call the callback function to enable login button
            // This is defined in the page: var callBack = function(response) { input.disabled = false; }
            // @ts-ignore
            if (typeof callBack === 'function') {
              // @ts-ignore
              callBack(token)
            }

            // Method 4: Also try grecaptcha callback from config
            // @ts-ignore
            if (window.___grecaptcha_cfg?.clients) {
              // @ts-ignore
              for (const client of Object.values(window.___grecaptcha_cfg.clients)) {
                // @ts-ignore
                const callback = client?.L?.L?.callback || client?.S?.S?.callback
                if (typeof callback === 'function') {
                  callback(token)
                }
              }
            }

            // Method 5: Directly enable the login button
            const loginBtn = document.getElementById('login_btn') as HTMLInputElement
            if (loginBtn) {
              loginBtn.disabled = false
            }
          }, captchaResult.token)

          this.log('info', 'reCAPTCHA token injected and callback triggered')
          await page.waitForTimeout(500) // Wait for button to enable
          recaptchaSolved = true
        } else {
          this.log('warn', `reCAPTCHA solving failed: ${captchaResult.error}`)
        }
      } else if (hasRecaptchaWidget) {
        this.log('warn', 'reCAPTCHA detected but CAPTCHA service not configured')
      }

      // Also check for reCAPTCHA v2 in iframe (older style)
      if (!recaptchaSolved) {
        try {
          const recaptchaFrame = page
            .frameLocator('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]')
            .first()
          const recaptchaCheckbox = recaptchaFrame.locator(
            '.recaptcha-checkbox-border, #recaptcha-anchor'
          )

          if (await recaptchaCheckbox.isVisible({ timeout: 2000 })) {
            this.log('info', 'reCAPTCHA v2 checkbox in iframe detected, clicking...')
            await recaptchaCheckbox.click()
            await page.waitForTimeout(1000)

            // Check if challenge appeared
            const challengeFrame = page.frameLocator(
              'iframe[src*="recaptcha"][title*="challenge"], iframe[src*="bframe"]'
            )
            try {
              const challengeVisible = await challengeFrame
                .locator('.rc-imageselect, .rc-audiochallenge')
                .isVisible({ timeout: 2000 })

              if (challengeVisible && captchaService.isConfigured()) {
                this.log('info', 'Image challenge appeared, solving with CapSolver...')
                const captchaResult = await captchaService.solveRecaptchaV2(
                  ASKUL_RECAPTCHA_V2_SITE_KEY,
                  page.url(),
                  false
                )
                if (captchaResult.success && captchaResult.token) {
                  await page.evaluate((token) => {
                    const textarea = document.getElementById(
                      'g-recaptcha-response'
                    ) as HTMLTextAreaElement
                    if (textarea) {
                      textarea.value = token
                      textarea.style.display = 'block'
                    }
                    const loginBtn = document.getElementById('login_btn') as HTMLInputElement
                    if (loginBtn) loginBtn.disabled = false
                  }, captchaResult.token)
                  recaptchaSolved = true
                }
              } else if (!challengeVisible) {
                this.log('info', 'reCAPTCHA checkbox clicked successfully (no challenge)')
                recaptchaSolved = true
              }
            } catch {
              this.log('info', 'reCAPTCHA checkbox clicked, no challenge detected')
              recaptchaSolved = true
            }
          }
        } catch (e) {
          this.log('debug', `No reCAPTCHA iframe found: ${e}`)
        }
      }

      // Now click the login button
      // The button should be enabled after reCAPTCHA is solved
      this.log('debug', 'Attempting to click login button...')

      // Wait a moment for any async operations
      await page.waitForTimeout(300)

      // Check if button is enabled
      const isButtonEnabled = await page.evaluate(() => {
        const btn = document.getElementById('login_btn') as HTMLInputElement
        return btn && !btn.disabled
      })

      if (!isButtonEnabled && recaptchaSolved) {
        // Force enable the button if we solved the captcha
        await page.evaluate(() => {
          const btn = document.getElementById('login_btn') as HTMLInputElement
          if (btn) btn.disabled = false
        })
        this.log('debug', 'Forced login button to be enabled')
      }

      // Click login button or submit form
      const loginBtn = page.locator('#login_btn, input.login_btn').first()
      if (await loginBtn.isVisible({ timeout: 3000 })) {
        await loginBtn.click()
        this.log('info', 'Clicked login button')
      } else {
        // Fallback: submit form directly
        await page.evaluate(() => {
          const form = document.getElementById('loginForm') as HTMLFormElement
          if (form) form.submit()
        })
        this.log('debug', 'Submitted form directly')
      }

      // Wait longer for reCAPTCHA processing and page navigation
      this.log('debug', 'Waiting for login to complete (reCAPTCHA may be processing)...')
      await page.waitForTimeout(WAIT_TIMES.loginProcess)

      // Wait for either navigation or timeout
      try {
        await page.waitForNavigation({ timeout: 10000, waitUntil: 'networkidle' })
      } catch {
        // Navigation may have already happened or timed out
        this.log('debug', 'Navigation wait completed or timed out')
      }

      await page.waitForTimeout(WAIT_TIMES.afterClick)

      // Check if login successful - look for user area or logged in indicator
      const currentUrl = page.url()
      const isLoginPage = currentUrl.includes('Logon') || currentUrl.includes('login')

      if (!isLoginPage) {
        session.isLoggedIn = true
        this.log('info', 'Login successful')
        return true
      }

      this.log('error', 'Login failed - still on login page')
      return false
    } catch (error) {
      this.log('error', `Login error: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  private async checkStock(page: Page): Promise<{ inStock: boolean; message: string }> {
    // Method 1: Check for green stock indicator (most reliable)
    // HTML: <span class="m-variationitemcard_stock -green">あり</span>
    // or: <span class="a-span u-text-darkgreen u-text-bold">あり</span>
    try {
      const greenStock = page.locator(SELECTORS.product.stockStatusGreen).first()
      if (await greenStock.isVisible({ timeout: 1500 })) {
        const text = await greenStock.textContent()
        if (text?.includes('あり')) {
          return { inStock: true, message: 'IN_STOCK (green indicator)' }
        }
      }
    } catch {
      // Continue to next check
    }

    // Method 2: Check for red/out of stock indicator
    try {
      const redStock = page.locator(SELECTORS.product.stockStatusRed).first()
      if (await redStock.isVisible({ timeout: 1000 })) {
        return { inStock: false, message: 'OUT_OF_STOCK (red indicator)' }
      }
    } catch {
      // Continue to next check
    }

    // Method 3: Check page content for out of stock text markers
    const content = await page.content()
    for (const marker of SELECTORS.product.outOfStockTexts) {
      if (content.includes(marker)) {
        return { inStock: false, message: `OUT_OF_STOCK: ${marker}` }
      }
    }

    // Method 4: Check if add to cart button exists and is enabled
    try {
      const addToCartBtn = page.locator(SELECTORS.product.addToCartButton).first()
      if (await addToCartBtn.isVisible({ timeout: 1500 })) {
        // Check parent button is not disabled
        const parentBtn = page.locator('button:has(.m-btn_text)').first()
        const isDisabled = await parentBtn.isDisabled().catch(() => false)
        if (!isDisabled) {
          return { inStock: true, message: 'IN_STOCK (cart button available)' }
        }
      }
    } catch {
      // Button not found
    }

    return { inStock: false, message: 'UNKNOWN - could not determine stock status' }
  }

  private async addToCart(page: Page, quantity: number): Promise<boolean> {
    try {
      // First try quantity select dropdown (most common on Askul)
      try {
        const qtySelect = page.locator(SELECTORS.product.quantitySelect).first()
        if (await qtySelect.isVisible({ timeout: 2000 })) {
          await qtySelect.selectOption(String(quantity))
          this.log('info', `Selected quantity ${quantity} from dropdown`)
        }
      } catch {
        // If dropdown not found, try input field
        try {
          const qtyInput = page.locator(SELECTORS.product.quantityInput).first()
          if (await qtyInput.isVisible({ timeout: 2000 })) {
            await qtyInput.clear()
            await qtyInput.fill(String(quantity))
            this.log('info', `Entered quantity ${quantity} in input field`)
          }
        } catch {
          this.log('debug', 'Quantity input not found, using default quantity 1')
        }
      }

      await page.waitForTimeout(WAIT_TIMES.afterInput)

      // Click add to cart button - target the span, but click the parent button
      const addToCartSpan = page.locator('.m-btn_text:has-text("カゴに入れる")').first()
      if (await addToCartSpan.isVisible({ timeout: 3000 })) {
        // Click the parent button element
        const parentBtn = page.locator('button:has(.m-btn_text:has-text("カゴに入れる"))').first()
        await parentBtn.click()
      } else {
        // Fallback to original selector
        const addToCartBtn = page.locator(SELECTORS.product.addToCartButton).first()
        await addToCartBtn.waitFor({ state: 'visible', timeout: 5000 })
        await addToCartBtn.click()
      }

      this.log('info', 'Clicked add to cart')

      // Wait for cart confirmation - either redirect to cart or show cart modal/popup
      await page.waitForTimeout(WAIT_TIMES.afterClick)

      // Check if we're now on cart page or got a cart confirmation
      const currentUrl = page.url()
      const content = await page.content()

      // Check for cart confirmation indicators
      const cartConfirmed =
        currentUrl.includes('shoppingCart') ||
        currentUrl.includes('cart') ||
        content.includes('カゴに入れました') ||
        content.includes('商品をカゴに入れました') ||
        content.includes('カートに追加')

      if (cartConfirmed) {
        this.log('info', 'Product added to cart successfully')
        return true
      }

      // Wait a bit more and check networkidle
      await page.waitForLoadState('networkidle')
      this.log('info', 'Add to cart completed')
      return true
    } catch (error) {
      this.log(
        'error',
        `Add to cart failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  private async proceedToCheckout(page: Page): Promise<boolean> {
    try {
      // Navigate to cart
      await page.goto(ASKUL_URLS.cart, { waitUntil: 'networkidle' })
      await page.waitForTimeout(WAIT_TIMES.navigation)

      // Click proceed to checkout - based on HTML: <a class="bsk1712-btn bsk1712-btn-orange" onclick="orderProcess()...">
      // Try the onclick handler first
      const checkoutBtn = page.locator('a.bsk1712-btn-orange[onclick*="orderProcess"]').first()
      if (await checkoutBtn.isVisible({ timeout: 3000 })) {
        await checkoutBtn.click()
      } else {
        // Fallback to text-based selector
        const fallbackBtn = page.locator(SELECTORS.cart.proceedToCheckout).first()
        await fallbackBtn.waitFor({ state: 'visible', timeout: 5000 })
        await fallbackBtn.click()
      }

      this.log('info', 'Proceeding to checkout')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(WAIT_TIMES.afterClick)

      return true
    } catch (error) {
      this.log(
        'error',
        `Proceed to checkout failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  private async completeCheckout(page: Page, securityCode?: string): Promise<boolean> {
    try {
      // Wait for checkout page to load
      await page.waitForTimeout(WAIT_TIMES.afterClick)

      // Check if credit card option needs to be selected
      try {
        const ccRadio = page.locator(SELECTORS.checkout.creditCardRadio).first()
        if (await ccRadio.isVisible({ timeout: 2000 })) {
          const isChecked = await ccRadio.isChecked().catch(() => false)
          if (!isChecked) {
            await ccRadio.click()
            this.log('info', 'Selected credit card payment option')
            await page.waitForTimeout(WAIT_TIMES.navigation)
          } else {
            this.log('info', 'Credit card already selected')
          }
        }
      } catch {
        this.log('debug', 'Credit card radio not found or already selected')
      }

      // Fill security code if required and provided
      if (securityCode) {
        try {
          const secCodeInput = page.locator(SELECTORS.checkout.securityCodeInput).first()
          if (await secCodeInput.isVisible({ timeout: 1500 })) {
            await secCodeInput.clear()
            await secCodeInput.fill(securityCode)
            this.log('info', 'Entered security code')
            await page.waitForTimeout(WAIT_TIMES.afterInput)
          }
        } catch {
          this.log('debug', 'Security code input not found')
        }
      }

      // STEP 1: Click first confirm button (opens modal)
      // HTML: <a class="reg1712-btn reg1712-btn-orange js-opnModal" mt:id="SUBMIT_TO_COMPLETE_TAG">ご注文確定</a>
      this.log('info', 'Step 1: Clicking first confirm button to open modal...')
      const firstConfirmBtn = page.locator(SELECTORS.checkout.firstConfirmButton).first()
      await firstConfirmBtn.waitFor({ state: 'visible', timeout: 10000 })
      await firstConfirmBtn.click()
      this.log('info', 'Clicked first confirm button - waiting for modal...')

      // Wait for modal (id="locationConfigModal") to appear
      await page.waitForTimeout(1000) // Give modal time to animate in

      // STEP 2: Wait for modal and check the agreement checkbox (置き場所指定確認事項に同意する)
      // Modal structure: #locationConfigModal > ... > ul.js-checkConfirmedList > li.js-check > label.reg1712-checkbox
      // Checkbox structure: <label><span class="reg1712-icon"><span></span><input type="checkbox" name=""></span>TEXT</label>
      this.log('info', 'Step 2: Looking for agreement checkbox in modal #locationConfigModal...')

      let checkboxClicked = false

      // Wait for modal to be visible
      try {
        await page.waitForSelector('#locationConfigModal', { state: 'visible', timeout: 5000 })
        this.log('info', 'Modal #locationConfigModal is visible')
      } catch {
        this.log('warn', 'Modal #locationConfigModal not found, trying to continue...')
      }

      // Try clicking the checkbox - various approaches
      // Approach 1: Click the checkbox input directly inside the modal
      try {
        const modalCheckbox = page
          .locator('#locationConfigModal li.js-check input[type="checkbox"]')
          .first()
        if (await modalCheckbox.isVisible({ timeout: 2000 })) {
          await modalCheckbox.click({ force: true })
          this.log('info', 'Clicked checkbox input directly in modal')
          checkboxClicked = true
        }
      } catch (e) {
        this.log('debug', `Direct checkbox click failed: ${e}`)
      }

      // Approach 2: Click the label in the modal
      if (!checkboxClicked) {
        try {
          const modalLabel = page.locator('#locationConfigModal label.reg1712-checkbox').first()
          if (await modalLabel.isVisible({ timeout: 2000 })) {
            await modalLabel.click({ force: true })
            this.log('info', 'Clicked label in modal')
            checkboxClicked = true
          }
        } catch (e) {
          this.log('debug', `Label click failed: ${e}`)
        }
      }

      // Approach 3: Click the span.reg1712-icon inside the label
      if (!checkboxClicked) {
        try {
          const iconSpan = page
            .locator('#locationConfigModal label.reg1712-checkbox span.reg1712-icon')
            .first()
          if (await iconSpan.isVisible({ timeout: 2000 })) {
            await iconSpan.click({ force: true })
            this.log('info', 'Clicked span.reg1712-icon in modal')
            checkboxClicked = true
          }
        } catch (e) {
          this.log('debug', `Icon span click failed: ${e}`)
        }
      }

      // Approach 4: Use JavaScript to click checkbox inside the specific modal
      if (!checkboxClicked) {
        try {
          const result = await page.evaluate(() => {
            // Find the modal
            const modal = document.querySelector('#locationConfigModal')
            if (!modal) {
              console.log('Modal not found')
              return false
            }

            // Find checkbox in the modal
            const checkbox = modal.querySelector(
              'li.js-check input[type="checkbox"]'
            ) as HTMLInputElement
            if (checkbox) {
              checkbox.click()
              console.log('Clicked checkbox via JS')
              return true
            }

            // Try clicking the label
            const label = modal.querySelector('li.js-check label.reg1712-checkbox') as HTMLElement
            if (label) {
              label.click()
              console.log('Clicked label via JS')
              return true
            }

            // Try finding any checkbox with the text nearby
            const allLabels = modal.querySelectorAll('label.reg1712-checkbox')
            for (const lbl of allLabels) {
              if (lbl.textContent?.includes('置き場所指定確認事項に同意する')) {
                const input = lbl.querySelector('input[type="checkbox"]') as HTMLInputElement
                if (input) {
                  input.checked = true
                  input.dispatchEvent(new Event('change', { bubbles: true }))
                  input.dispatchEvent(new Event('click', { bubbles: true }))
                  console.log('Set checkbox checked via JS')
                  return true
                }
                ;(lbl as HTMLElement).click()
                return true
              }
            }

            return false
          })

          if (result) {
            this.log('info', 'Clicked checkbox using JavaScript in modal')
            checkboxClicked = true
          }
        } catch (e) {
          this.log('warn', `JavaScript checkbox click failed: ${e}`)
        }
      }

      // Approach 5: Click using coordinates if visible
      if (!checkboxClicked) {
        try {
          // Try to find and click the li.js-check element
          const jsCheckLi = page
            .locator('#locationConfigModal ul.js-checkConfirmedList li.js-check')
            .first()
          if (await jsCheckLi.isVisible({ timeout: 1000 })) {
            const box = await jsCheckLi.boundingBox()
            if (box) {
              // Click on the left side where the checkbox should be
              await page.mouse.click(box.x + 20, box.y + box.height / 2)
              this.log('info', 'Clicked checkbox area using mouse coordinates')
              checkboxClicked = true
            }
          }
        } catch (e) {
          this.log('debug', `Mouse click failed: ${e}`)
        }
      }

      if (!checkboxClicked) {
        this.log('warn', 'Could not click agreement checkbox - trying to continue anyway')
      }

      await page.waitForTimeout(500) // Wait for checkbox state to update

      // STEP 3: Click final confirm button in modal (submits the order)
      // HTML: <a href="javascript:void(0);" onclick="javascript:submitAll({...})" class="js-confirmOrder reg1712-btn-orange">ご注文確定</a>
      this.log('info', 'Step 3: Clicking final confirm button in modal...')

      // Wait a moment for checkbox state to register
      await page.waitForTimeout(300)

      // The final confirm button is inside the modal with class js-confirmOrder
      // Try multiple selectors
      let finalConfirmBtn = page.locator('#locationConfigModal a.js-confirmOrder').first()

      if (!(await finalConfirmBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
        finalConfirmBtn = page.locator('a.js-confirmOrder:has-text("ご注文確定")').first()
      }

      // Wait for it to be visible and enabled
      await finalConfirmBtn.waitFor({ state: 'visible', timeout: 5000 })

      // Check if button is disabled
      const isDisabled = await finalConfirmBtn
        .evaluate((el) => {
          return (
            el.classList.contains('js-inactiveConfirmBtn') ||
            el.hasAttribute('disabled') ||
            el.style.pointerEvents === 'none'
          )
        })
        .catch(() => false)

      if (isDisabled) {
        this.log('warn', 'Final confirm button is disabled - checkbox may not be checked')
        // Try clicking checkbox again via JavaScript in the modal
        await page.evaluate(() => {
          const modal = document.querySelector('#locationConfigModal')
          if (!modal) return

          const checkboxes = modal.querySelectorAll('li.js-check input[type="checkbox"]')
          checkboxes.forEach((cb: Element) => {
            const input = cb as HTMLInputElement
            if (!input.checked) {
              input.checked = true
              input.dispatchEvent(new Event('change', { bubbles: true }))
              input.dispatchEvent(new Event('click', { bubbles: true }))
            }
          })
        })
        await page.waitForTimeout(500)
      }

      await finalConfirmBtn.click()
      this.log('info', 'Clicked final confirm button - order submitted!')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(WAIT_TIMES.loginProcess)

      // Check if order completed
      const finalContent = await page.content()
      const currentUrl = page.url()
      const orderSuccess =
        finalContent.includes('ご注文ありがとう') ||
        finalContent.includes('注文完了') ||
        finalContent.includes('ご注文を承りました') ||
        currentUrl.includes('orderComplete')

      if (orderSuccess) {
        this.log('info', 'Order completed successfully!')
        return true
      }

      this.log('warn', 'Order completion status unclear - may have succeeded')
      return true // Assume success if no error
    } catch (error) {
      this.log(
        'error',
        `Checkout failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  async checkAvailability(ctx: AdapterContext): Promise<AvailabilityResult> {
    const actionUrl = ctx.task.url
    const taskId = ctx.task.id

    try {
      // Get or create session for this specific task
      const session = await this.getOrCreateSession(taskId, ctx.proxy)
      const page = session.page

      // ============================================================
      // [TEMPORARY] CHECK IF ORDER ALREADY COMPLETED - RUN ONLY ONCE
      // Comment out this block to allow multiple runs
      // ============================================================
      if (session.orderCompleted) {
        this.log(
          'info',
          `[Task ${taskId}] ⚠️ Order already completed! Skipping to prevent duplicate orders.`
        )
        this.log(
          'info',
          `[Task ${taskId}] To run again, stop and restart the task, or remove the orderCompleted check.`
        )
        return {
          available: true,
          message: 'ORDER_ALREADY_COMPLETED - Skipped to prevent duplicate',
          actionUrl: ASKUL_URLS.orderProcessComplete
        }
      }
      // ============================================================
      // END OF TEMPORARY BLOCK
      // ============================================================

      // Login first
      const loggedIn = await this.login(session)
      if (!loggedIn) {
        return { available: false, message: 'LOGIN_FAILED', actionUrl }
      }

      // Navigate to product page
      this.log('info', `[Task ${taskId}] Checking product: ${ctx.task.url}`)
      await page.goto(ctx.task.url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(WAIT_TIMES.afterClick)

      // Check stock
      const stockStatus = await this.checkStock(page)
      this.log('info', `[Task ${taskId}] Stock status: ${stockStatus.message}`)

      if (!stockStatus.inStock) {
        return { available: false, message: stockStatus.message, actionUrl }
      }

      // Product is in stock - proceed with purchase flow
      this.log('info', `[Task ${taskId}] Product AVAILABLE - starting purchase flow`)

      // Add to cart
      const addedToCart = await this.addToCart(page, ctx.task.desiredQty)
      if (!addedToCart) {
        return { available: true, message: 'AVAILABLE_BUT_CART_FAILED', actionUrl }
      }

      // IMPORTANT: Go directly to cart page to avoid re-checking product
      // Don't navigate back to product page
      this.log('info', `[Task ${taskId}] Navigating directly to cart...`)

      // Proceed to checkout (this navigates to cart first)
      const atCheckout = await this.proceedToCheckout(page)
      if (!atCheckout) {
        return { available: true, message: 'AVAILABLE_BUT_CHECKOUT_FAILED', actionUrl }
      }

      // Get security code from extraConfig if available
      const settings = siteSettingsStore.getBySiteKey(ASKUL_SITE_KEY)
      const securityCode = settings?.extraConfig?.securityCode as string | undefined

      // Complete checkout
      const orderComplete = await this.completeCheckout(page, securityCode)
      if (!orderComplete) {
        return { available: true, message: 'AVAILABLE_BUT_ORDER_FAILED', actionUrl }
      }

      // ============================================================
      // [TEMPORARY] MARK ORDER AS COMPLETED - PREVENT DUPLICATE RUNS
      // This ensures the task only completes the order ONCE
      // Comment out this block to allow multiple orders
      // ============================================================
      session.orderCompleted = true
      this.log('info', `[Task ${taskId}] ✅ Order marked as completed - will not run again`)
      // ============================================================
      // END OF TEMPORARY BLOCK
      // ============================================================

      // ============================================================
      // WAIT FOR ORDER PROCESSING (~20 seconds)
      // The order confirmation page takes time to generate
      // ============================================================
      this.log('info', `[Task ${taskId}] ⏳ Waiting 20 seconds for order processing to complete...`)
      await page.waitForTimeout(20000) // Wait 20 seconds

      // Navigate to order details page
      this.log(
        'info',
        `[Task ${taskId}] 📄 Navigating to order details page: ${ASKUL_URLS.orderProcessComplete}`
      )
      try {
        await page.goto(ASKUL_URLS.orderProcessComplete, {
          waitUntil: 'networkidle',
          timeout: 30000
        })
        this.log('info', `[Task ${taskId}] ✅ Order details page loaded successfully!`)
      } catch (navError) {
        this.log(
          'warn',
          `[Task ${taskId}] Could not navigate to order details: ${navError instanceof Error ? navError.message : String(navError)}`
        )
      }
      // ============================================================
      // END OF ORDER PROCESSING WAIT
      // ============================================================

      return {
        available: true,
        message: 'ORDER_COMPLETED',
        actionUrl: ASKUL_URLS.orderProcessComplete // Return the detailed order page URL
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log('error', `[Task ${taskId}] Check availability error: ${message}`)
      return { available: false, message: `ERROR: ${message}`, actionUrl }
    }
  }

  renderHumanAction(ctx: AdapterContext): string {
    return `Askul product checked: ${ctx.task.url}`
  }

  async cleanup(): Promise<void> {
    // Clear cleanup interval
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval)
      this.sessionCleanupInterval = null
    }

    // Close all sessions
    for (const [taskId, session] of this.sessions.entries()) {
      try {
        await session.page.close()
        await session.context.close()
      } catch {
        // Ignore errors during cleanup
      }
      this.sessions.delete(taskId)
    }

    // Close browser
    if (this.browser) {
      await this.browser.close().catch(() => {})
      this.browser = null
    }
    this.log('info', 'Browser cleaned up')
  }

  // Method to cleanup a specific task session (useful when task is stopped)
  async cleanupTaskSession(taskId: string): Promise<void> {
    const session = this.sessions.get(taskId)
    if (session) {
      try {
        await session.page.close()
        await session.context.close()
      } catch {
        // Ignore errors
      }
      this.sessions.delete(taskId)
      this.log('debug', `Cleaned up session for task ${taskId}`)
    }
  }
}
