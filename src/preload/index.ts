import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  AvailabilityEvent,
  LogRecord,
  ProfileInput,
  ProfileRecord,
  ProxyInput,
  ProxyRecord,
  SiteSettingsInput,
  SiteSettingsRecord,
  StatusEvent,
  TaskInput,
  TaskRecord
} from '../shared/types'

const api = {
  tasks: {
    list: (): Promise<TaskRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.tasks.list),
    create: (input: TaskInput): Promise<TaskRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.tasks.create, input),
    update: (id: string, patch: Partial<TaskInput>): Promise<TaskRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.tasks.update, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tasks.remove, id),
    removeAll: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tasks.removeAll),
    run: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tasks.run, id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tasks.stop, id),
    runAll: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tasks.runAll),
    stopAll: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tasks.stopAll),
    import: (format: 'json' | 'csv', content: string): Promise<TaskRecord[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.tasks.import, format, content),
    export: (format: 'json' | 'csv'): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.tasks.export, format)
  },
  proxies: {
    list: (): Promise<ProxyRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.proxies.list),
    listByGroup: (groupName: string | null): Promise<ProxyRecord[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.listByGroup, groupName),
    getGroups: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.proxies.getGroups),
    get: (id: string): Promise<ProxyRecord | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.get, id),
    createMany: (inputs: ProxyInput[]): Promise<ProxyRecord[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.createMany, inputs),
    update: (id: string, patch: Partial<ProxyInput>): Promise<ProxyRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.update, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.proxies.remove, id),
    removeByGroup: (groupName: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.removeByGroup, groupName),
    removeAll: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.proxies.removeAll),
    renameGroup: (oldName: string, newName: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.renameGroup, oldName, newName),
    checkOne: (
      id: string,
      endpoint: string,
      timeoutMs?: number
    ): Promise<{
      id: string
      status: 'ALIVE' | 'DEAD'
      latencyMs: number | null
      error?: string
    } | null> => ipcRenderer.invoke(IPC_CHANNELS.proxies.checkOne, id, endpoint, timeoutMs),
    checkAll: (endpoint: string, timeoutMs?: number): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.checkAll, endpoint, timeoutMs),
    export: (format: 'json' | 'csv'): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.proxies.export, format)
  },
  profiles: {
    list: (): Promise<ProfileRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.profiles.list),
    create: (input: ProfileInput): Promise<ProfileRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.profiles.create, input),
    update: (id: string, patch: Partial<ProfileInput>): Promise<ProfileRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.profiles.update, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.profiles.remove, id),
    saveSecrets: (profileId: string, secrets: Record<string, string>): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.profiles.saveSecrets, profileId, secrets)
  },
  siteSettings: {
    list: (): Promise<SiteSettingsRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.siteSettings.list),
    get: (id: string): Promise<SiteSettingsRecord | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.siteSettings.get, id),
    getBySiteKey: (siteKey: string): Promise<SiteSettingsRecord | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.siteSettings.getBySiteKey, siteKey),
    save: (input: SiteSettingsInput): Promise<SiteSettingsRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.siteSettings.save, input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.siteSettings.remove, id)
  },
  logs: {
    list: (limit?: number): Promise<LogRecord[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.logs.list, limit)
  },
  engine: {
    onStatus: (callback: (event: StatusEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: StatusEvent): void => {
        callback(data)
      }
      ipcRenderer.on(IPC_CHANNELS.engine.status, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.engine.status, listener)
    },
    onAvailability: (callback: (event: AvailabilityEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: AvailabilityEvent): void => {
        callback(data)
      }
      ipcRenderer.on(IPC_CHANNELS.engine.availability, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.engine.availability, listener)
    },
    onLog: (callback: (event: LogRecord) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: LogRecord): void => {
        callback(data)
      }
      ipcRenderer.on(IPC_CHANNELS.engine.log, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.engine.log, listener)
    }
  },
  app: {
    saveTextFile: (defaultPath: string, content: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.app.saveTextFile, defaultPath, content),
    openTextFile: (): Promise<{ path: string; content: string } | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.app.openTextFile)
  },
  settings: {
    getAll: (): Promise<Record<string, string | number | boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.getAll),
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.get, key),
    set: (key: string, value: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.set, key, value),
    setAll: (settings: Record<string, string | number | boolean>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.setAll, settings)
  },
  captcha: {
    isConfigured: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.captcha.isConfigured),
    getBalance: (): Promise<number | null> => ipcRenderer.invoke(IPC_CHANNELS.captcha.getBalance),
    testSolve: (): Promise<{ success: boolean; token?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.captcha.testSolve)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore fallback
  window.api = api
}
