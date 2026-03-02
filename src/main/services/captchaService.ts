/**
 * CAPTCHA Solving Service
 * Supports reCAPTCHA v2 using CapSolver API (Direct HTTP calls)
 *
 * CapSolver API Documentation: https://docs.capsolver.com/
 *
 * How reCAPTCHA works:
 * 1. Website loads reCAPTCHA with a SITE_KEY
 * 2. User clicks checkbox or solves image challenge
 * 3. Google returns a TOKEN to the website
 * 4. Website sends TOKEN to backend for verification
 *
 * What we do:
 * 1. Send SITE_KEY + PAGE_URL to CapSolver
 * 2. CapSolver solves the challenge (using their own browsers/workers)
 * 3. CapSolver returns the TOKEN
 * 4. We inject TOKEN into the page as if user solved it
 */

// ========== HARDCODED API KEY ==========
// CapSolver API Key - Get from https://dashboard.capsolver.com/
const CAPSOLVER_API_KEY = 'CAP-26D2E9B6FC38273BF89A8B7A16DB85D9196B91F68F8493C92AA87B4C37387DF8'

// CapSolver API endpoints
const CAPSOLVER_API_URL = 'https://api.capsolver.com'

// CAPTCHA types we can solve
export type CaptchaType = 'recaptcha-v2' | 'recaptcha-v3' | 'hcaptcha' | 'image'
export type CaptchaServiceType = 'capsolver' | 'twocaptcha'

export interface CaptchaRequest {
  type: CaptchaType
  siteKey: string // The site key found in the page (e.g., 6Lc1IWEo...)
  pageUrl: string // The URL where the CAPTCHA appears
  action?: string // For reCAPTCHA v3, the action name
  minScore?: number // For reCAPTCHA v3, minimum score (0.1 - 0.9)
  invisible?: boolean // For reCAPTCHA v2 invisible
  imageBase64?: string // For image CAPTCHA
}

export interface CaptchaResult {
  success: boolean
  token?: string // The solution token to submit
  error?: string
}

// CapSolver API response types
interface CapsolverCreateTaskResponse {
  errorId: number
  errorCode?: string
  errorDescription?: string
  taskId?: string
  status?: string
  solution?: {
    gRecaptchaResponse?: string
    token?: string
    text?: string
  }
}

interface CapsolverGetTaskResponse {
  errorId: number
  errorCode?: string
  errorDescription?: string
  status: string
  solution?: {
    gRecaptchaResponse?: string
    token?: string
    text?: string
  }
}

class CaptchaService {
  private apiKey: string = CAPSOLVER_API_KEY
  private serviceType: CaptchaServiceType = 'capsolver'

  constructor() {
    console.log('[CaptchaService] Initialized with CapSolver')
    console.log(`[CaptchaService] API Key: ${this.apiKey.substring(0, 10)}...`)
  }

  /**
   * Main method to solve any CAPTCHA
   */
  async solve(request: CaptchaRequest): Promise<CaptchaResult> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'No CapSolver API key configured'
      }
    }

    console.log(`[CaptchaService] Solving ${request.type} for ${request.pageUrl}`)
    console.log(`[CaptchaService] Site Key: ${request.siteKey}`)

    try {
      switch (request.type) {
        case 'recaptcha-v2':
          return await this.solveRecaptchaV2WithCapsolver(request)
        case 'recaptcha-v3':
          return await this.solveRecaptchaV3WithCapsolver(request)
        case 'hcaptcha':
          return await this.solveHCaptchaWithCapsolver(request)
        default:
          return { success: false, error: `Unsupported CAPTCHA type: ${request.type}` }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[CaptchaService] Error: ${errorMessage}`)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Solve reCAPTCHA v2 using CapSolver API
   * This is used for checkbox reCAPTCHA with potential image challenges
   */
  private async solveRecaptchaV2WithCapsolver(request: CaptchaRequest): Promise<CaptchaResult> {
    console.log('[CaptchaService] Creating reCAPTCHA v2 task with CapSolver...')

    // Step 1: Create task
    const createTaskPayload = {
      clientKey: this.apiKey,
      task: {
        type: 'ReCaptchaV2TaskProxyLess',
        websiteURL: request.pageUrl,
        websiteKey: request.siteKey,
        isInvisible: request.invisible || false
      }
    }

    console.log('[CaptchaService] Request payload:', JSON.stringify(createTaskPayload, null, 2))

    const createResponse = await fetch(`${CAPSOLVER_API_URL}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createTaskPayload)
    })

    const createResult: CapsolverCreateTaskResponse = await createResponse.json()
    console.log('[CaptchaService] CreateTask response:', JSON.stringify(createResult, null, 2))

    if (createResult.errorId !== 0) {
      return {
        success: false,
        error: `CapSolver error: ${createResult.errorCode} - ${createResult.errorDescription}`
      }
    }

    // Check if solved immediately (some tasks solve instantly)
    if (createResult.status === 'ready' && createResult.solution) {
      const token = createResult.solution.gRecaptchaResponse || createResult.solution.token
      if (token) {
        console.log('[CaptchaService] Task solved immediately!')
        return { success: true, token }
      }
    }

    // Step 2: Poll for result
    const taskId = createResult.taskId
    if (!taskId) {
      return { success: false, error: 'No taskId returned from CapSolver' }
    }

    console.log(`[CaptchaService] Task created: ${taskId}, polling for result...`)
    return await this.pollForResult(taskId)
  }

  /**
   * Solve reCAPTCHA v3 using CapSolver API
   * This is for invisible reCAPTCHA that runs in background
   */
  private async solveRecaptchaV3WithCapsolver(request: CaptchaRequest): Promise<CaptchaResult> {
    console.log('[CaptchaService] Creating reCAPTCHA v3 task with CapSolver...')

    const createTaskPayload = {
      clientKey: this.apiKey,
      task: {
        type: 'ReCaptchaV3TaskProxyLess',
        websiteURL: request.pageUrl,
        websiteKey: request.siteKey,
        pageAction: request.action || 'verify',
        minScore: request.minScore || 0.7
      }
    }

    const createResponse = await fetch(`${CAPSOLVER_API_URL}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createTaskPayload)
    })

    const createResult: CapsolverCreateTaskResponse = await createResponse.json()
    console.log('[CaptchaService] CreateTask response:', JSON.stringify(createResult, null, 2))

    if (createResult.errorId !== 0) {
      return {
        success: false,
        error: `CapSolver error: ${createResult.errorCode} - ${createResult.errorDescription}`
      }
    }

    if (createResult.status === 'ready' && createResult.solution) {
      const token = createResult.solution.gRecaptchaResponse || createResult.solution.token
      if (token) {
        console.log('[CaptchaService] Task solved immediately!')
        return { success: true, token }
      }
    }

    const taskId = createResult.taskId
    if (!taskId) {
      return { success: false, error: 'No taskId returned from CapSolver' }
    }

    return await this.pollForResult(taskId)
  }

  /**
   * Solve hCaptcha using CapSolver API
   */
  private async solveHCaptchaWithCapsolver(request: CaptchaRequest): Promise<CaptchaResult> {
    console.log('[CaptchaService] Creating hCaptcha task with CapSolver...')

    const createTaskPayload = {
      clientKey: this.apiKey,
      task: {
        type: 'HCaptchaTaskProxyLess',
        websiteURL: request.pageUrl,
        websiteKey: request.siteKey
      }
    }

    const createResponse = await fetch(`${CAPSOLVER_API_URL}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createTaskPayload)
    })

    const createResult: CapsolverCreateTaskResponse = await createResponse.json()

    if (createResult.errorId !== 0) {
      return {
        success: false,
        error: `CapSolver error: ${createResult.errorCode} - ${createResult.errorDescription}`
      }
    }

    if (createResult.status === 'ready' && createResult.solution) {
      const token = createResult.solution.gRecaptchaResponse || createResult.solution.token
      if (token) {
        return { success: true, token }
      }
    }

    const taskId = createResult.taskId
    if (!taskId) {
      return { success: false, error: 'No taskId returned from CapSolver' }
    }

    return await this.pollForResult(taskId)
  }

  /**
   * Poll CapSolver API for task result
   * Max 120 seconds (typical solve time: 10-30 seconds)
   */
  private async pollForResult(taskId: string): Promise<CaptchaResult> {
    const maxAttempts = 60 // 60 * 2 seconds = 120 seconds max
    const pollInterval = 2000 // 2 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.sleep(pollInterval)

      console.log(`[CaptchaService] Polling attempt ${attempt}/${maxAttempts}...`)

      const getResultPayload = {
        clientKey: this.apiKey,
        taskId: taskId
      }

      const getResponse = await fetch(`${CAPSOLVER_API_URL}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getResultPayload)
      })

      const getResult: CapsolverGetTaskResponse = await getResponse.json()

      if (getResult.errorId !== 0) {
        return {
          success: false,
          error: `CapSolver error: ${getResult.errorCode} - ${getResult.errorDescription}`
        }
      }

      if (getResult.status === 'ready' && getResult.solution) {
        const token =
          getResult.solution.gRecaptchaResponse ||
          getResult.solution.token ||
          getResult.solution.text

        if (token) {
          console.log('[CaptchaService] ✅ CAPTCHA solved successfully!')
          console.log(`[CaptchaService] Token (first 50 chars): ${token.substring(0, 50)}...`)
          return { success: true, token }
        }
      }

      if (getResult.status === 'processing') {
        console.log('[CaptchaService] Still processing...')
        continue
      }
    }

    return { success: false, error: 'Timeout: CAPTCHA solving took too long' }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Convenience method for reCAPTCHA v2
   */
  async solveRecaptchaV2(
    siteKey: string,
    pageUrl: string,
    invisible: boolean = false
  ): Promise<CaptchaResult> {
    return this.solve({
      type: 'recaptcha-v2',
      siteKey,
      pageUrl,
      invisible
    })
  }

  /**
   * Convenience method for reCAPTCHA v3
   */
  async solveRecaptchaV3(
    siteKey: string,
    pageUrl: string,
    action: string = 'verify'
  ): Promise<CaptchaResult> {
    return this.solve({
      type: 'recaptcha-v3',
      siteKey,
      pageUrl,
      action,
      minScore: 0.7
    })
  }

  /**
   * Get CapSolver account balance
   */
  async getBalance(): Promise<number | null> {
    try {
      const response = await fetch(`${CAPSOLVER_API_URL}/getBalance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: this.apiKey })
      })

      const result = await response.json()
      if (result.errorId === 0) {
        console.log(`[CaptchaService] Balance: $${result.balance}`)
        return result.balance
      }
      return null
    } catch (error) {
      console.error('[CaptchaService] Failed to get balance:', error)
      return null
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0
  }

  /**
   * Get current service type
   */
  getServiceType(): CaptchaServiceType {
    return this.serviceType
  }
}

// Export singleton instance
export const captchaService = new CaptchaService()
