import { app, shell, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { BotManager } from './BotManager'
import {
  initDb,
  logStore,
  profileStore,
  proxyStore,
  taskStore,
  siteSettingsStore,
  settingsStore
} from './db'
import { captchaService } from './services/captchaService'
import { IPC_CHANNELS } from '../shared/ipc'
import type { ProfileInput, ProxyInput, SiteSettingsInput, TaskInput } from '../shared/types'
import { checkAllProxies, checkProxy } from './services/proxyService'
import { exportToCsv, exportToJson } from './services/exportService'
import {
  buildProfileSecretRef,
  buildProxySecretRef,
  buildSiteSettingsSecretRef,
  saveSecret
} from './services/secretService'
import { readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { parse } from 'csv-parse/sync'

let mainWindow: BrowserWindow
let botManager: BotManager

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupAutoUpdate(): void {
  if (!app.isPackaged) return

  autoUpdater.logger = null
  autoUpdater.checkForUpdatesAndNotify()
}

function setupIpc(): void {
  ipcMain.handle(IPC_CHANNELS.tasks.list, () => taskStore.list())
  ipcMain.handle(IPC_CHANNELS.tasks.create, (_event, input: TaskInput) => taskStore.create(input))
  ipcMain.handle(IPC_CHANNELS.tasks.update, (_event, id: string, patch: Partial<TaskInput>) =>
    taskStore.update(id, patch)
  )
  ipcMain.handle(IPC_CHANNELS.tasks.remove, (_event, id: string) => {
    // Stop the task first (close browser tab and cleanup)
    botManager.engine.stopTask(id)
    // Then remove from database
    return taskStore.remove(id)
  })
  ipcMain.handle(IPC_CHANNELS.tasks.removeAll, () => {
    // Stop all tasks first
    botManager.engine.stopAll()
    // Then remove all from database
    return taskStore.removeAll()
  })
  ipcMain.handle(IPC_CHANNELS.tasks.run, (_event, id: string) => botManager.engine.startTask(id))
  ipcMain.handle(IPC_CHANNELS.tasks.stop, (_event, id: string) => botManager.engine.stopTask(id))
  ipcMain.handle(IPC_CHANNELS.tasks.runAll, () => botManager.engine.startAll())
  ipcMain.handle(IPC_CHANNELS.tasks.stopAll, () => botManager.engine.stopAll())
  ipcMain.handle(IPC_CHANNELS.tasks.import, (_event, format: 'json' | 'csv', content: string) => {
    const rows =
      format === 'csv'
        ? parse(content, { columns: true, skip_empty_lines: true })
        : JSON.parse(content)
    const items = Array.isArray(rows) ? rows : []
    return items.map((item) =>
      taskStore.create({
        name: item.name ?? null,
        url: item.url,
        siteKey: item.siteKey ?? null,
        desiredQty: Number(item.desiredQty ?? 1),
        intervalMs: Number(item.intervalMs ?? 30000),
        groupName: item.groupName ?? null,
        proxyId: item.proxyId ?? null,
        profileId: item.profileId ?? null
      })
    )
  })
  ipcMain.handle(IPC_CHANNELS.tasks.export, (_event, format: 'json' | 'csv') => {
    const tasks = taskStore.list()
    return format === 'csv' ? exportToCsv(tasks) : exportToJson(tasks)
  })

  ipcMain.handle(IPC_CHANNELS.proxies.list, () => proxyStore.list())
  ipcMain.handle(IPC_CHANNELS.proxies.listByGroup, (_event, groupName: string | null) =>
    proxyStore.listByGroup(groupName)
  )
  ipcMain.handle(IPC_CHANNELS.proxies.getGroups, () => proxyStore.getGroups())
  ipcMain.handle(IPC_CHANNELS.proxies.get, (_event, id: string) => proxyStore.get(id))
  ipcMain.handle(IPC_CHANNELS.proxies.createMany, async (_event, inputs: ProxyInput[]) => {
    const normalized = await Promise.all(
      inputs.map(async (input) => {
        const id = input.id ?? randomUUID()
        let passwordRef: string | null = null
        if (input.password) {
          passwordRef = buildProxySecretRef(id)
          await saveSecret(passwordRef, input.password)
        }
        return { ...input, id, passwordRef }
      })
    )

    return proxyStore.createMany(normalized)
  })
  ipcMain.handle(
    IPC_CHANNELS.proxies.update,
    async (_event, id: string, patch: Partial<ProxyInput>) => {
      if (patch.password) {
        const passwordRef = buildProxySecretRef(id)
        await saveSecret(passwordRef, patch.password)
        return proxyStore.update(id, { ...patch, passwordRef })
      }
      return proxyStore.update(id, patch)
    }
  )
  ipcMain.handle(IPC_CHANNELS.proxies.remove, (_event, id: string) => proxyStore.remove(id))
  ipcMain.handle(IPC_CHANNELS.proxies.removeByGroup, (_event, groupName: string) =>
    proxyStore.removeByGroup(groupName)
  )
  ipcMain.handle(IPC_CHANNELS.proxies.removeAll, () => proxyStore.removeAll())
  ipcMain.handle(IPC_CHANNELS.proxies.renameGroup, (_event, oldName: string, newName: string) =>
    proxyStore.renameGroup(oldName, newName)
  )
  ipcMain.handle(
    IPC_CHANNELS.proxies.checkOne,
    async (_event, id: string, endpoint: string, timeoutMs?: number) => {
      const proxy = proxyStore.get(id)
      if (!proxy) return null
      const result = await checkProxy(proxy, endpoint, timeoutMs)
      proxyStore.update(id, {
        status: result.status,
        lastLatencyMs: result.latencyMs,
        lastCheckedAt: Date.now()
      })
      return result
    }
  )
  ipcMain.handle(IPC_CHANNELS.proxies.checkAll, (_event, endpoint: string, timeoutMs?: number) =>
    checkAllProxies(endpoint, timeoutMs)
  )
  ipcMain.handle(IPC_CHANNELS.proxies.export, (_event, format: 'json' | 'csv') => {
    const proxies = proxyStore.list()
    return format === 'csv' ? exportToCsv(proxies) : exportToJson(proxies)
  })

  ipcMain.handle(IPC_CHANNELS.profiles.list, () => profileStore.list())
  ipcMain.handle(IPC_CHANNELS.profiles.create, (_event, input: ProfileInput) =>
    profileStore.create(input)
  )
  ipcMain.handle(IPC_CHANNELS.profiles.update, (_event, id: string, patch: Partial<ProfileInput>) =>
    profileStore.update(id, patch)
  )
  ipcMain.handle(IPC_CHANNELS.profiles.remove, (_event, id: string) => profileStore.remove(id))
  ipcMain.handle(
    IPC_CHANNELS.profiles.saveSecrets,
    async (_event, profileId: string, secrets: Record<string, string>) => {
      const keys = Object.keys(secrets)
      for (const key of keys) {
        const ref = buildProfileSecretRef(profileId, key)
        await saveSecret(ref, secrets[key])
      }
      const profile = profileStore.get(profileId)
      const updatedKeys = Array.from(new Set([...(profile?.secretKeys ?? []), ...keys]))
      profileStore.update(profileId, { secretKeys: updatedKeys })
      return updatedKeys
    }
  )

  // Site Settings handlers
  ipcMain.handle(IPC_CHANNELS.siteSettings.list, () => siteSettingsStore.list())
  ipcMain.handle(IPC_CHANNELS.siteSettings.get, (_event, id: string) => siteSettingsStore.get(id))
  ipcMain.handle(IPC_CHANNELS.siteSettings.getBySiteKey, (_event, siteKey: string) =>
    siteSettingsStore.getBySiteKey(siteKey)
  )
  ipcMain.handle(IPC_CHANNELS.siteSettings.save, async (_event, input: SiteSettingsInput) => {
    let passwordRef: string | null = null
    if (input.password) {
      passwordRef = buildSiteSettingsSecretRef(input.siteKey)
      await saveSecret(passwordRef, input.password)
    }
    return siteSettingsStore.upsert({ ...input, passwordRef })
  })
  ipcMain.handle(IPC_CHANNELS.siteSettings.remove, (_event, id: string) =>
    siteSettingsStore.remove(id)
  )

  ipcMain.handle(IPC_CHANNELS.logs.list, (_event, limit?: number) => logStore.list(limit))

  // App Settings handlers
  ipcMain.handle('settings:getAll', () => settingsStore.getAll())
  ipcMain.handle('settings:get', (_event, key: string) => settingsStore.get(key))
  ipcMain.handle('settings:set', (_event, key: string, value: string | null) =>
    settingsStore.set(key, value)
  )
  ipcMain.handle('settings:setAll', (_event, settings: Record<string, string | number | boolean>) =>
    settingsStore.setAll(settings)
  )

  // CAPTCHA service handlers
  ipcMain.handle('captcha:isConfigured', () => captchaService.isConfigured())
  ipcMain.handle('captcha:getBalance', () => captchaService.getBalance())
  ipcMain.handle('captcha:testSolve', async () => {
    // Test with Google's test site key
    return captchaService.solveRecaptchaV3(
      '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', // Google's test key
      'https://www.google.com/recaptcha/api2/demo',
      'test'
    )
  })

  ipcMain.handle(
    IPC_CHANNELS.app.saveTextFile,
    async (_event, defaultPath: string, content: string) => {
      const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath })
      if (canceled || !filePath) return null
      await writeFile(filePath, content, 'utf-8')
      return filePath
    }
  )

  ipcMain.handle(IPC_CHANNELS.app.openTextFile, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Data', extensions: ['json', 'csv', 'txt'] }]
    })
    if (canceled || filePaths.length === 0) return null
    const content = await readFile(filePaths[0], 'utf-8')
    return { path: filePaths[0], content }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.automation.console')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb()

  // Initialize CAPTCHA service settings if not configured
  const currentApiKey = settingsStore.get('captchaApiKey')
  if (!currentApiKey) {
    // Set default CapSolver API key
    settingsStore.set(
      'captchaApiKey',
      'CAP-26D2E9B6FC38273BF89A8B7A16DB85D9196B91F68F8493C92AA87B4C37387DF8'
    )
    settingsStore.set('captchaService', 'capsolver')
    console.log('[App] CapSolver API key configured')
  }

  botManager = new BotManager(
    {
      concurrency: 4,
      rateLimitMinTime: 300,
      rateLimitMaxConcurrent: 2,
      retryCount: 2,
      retryBaseDelayMs: 1000
    },
    {
      onStatus: (event) => mainWindow.webContents.send(IPC_CHANNELS.engine.status, event),
      onAvailability: (event) =>
        mainWindow.webContents.send(IPC_CHANNELS.engine.availability, event),
      onLog: (level, message, meta) => {
        const record = logStore.add({
          level,
          message,
          meta: meta ?? null,
          taskId: meta?.taskId as string | null
        })
        mainWindow.webContents.send(IPC_CHANNELS.engine.log, record)
      },
      notify: (title, body, actionUrl) => {
        const notification = new Notification({ title, body })
        notification.on('click', () => shell.openExternal(actionUrl))
        notification.show()
      }
    }
  )

  createWindow()
  setupIpc()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
