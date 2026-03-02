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

declare global {
  interface Window {
    api: {
      tasks: {
        list: () => Promise<TaskRecord[]>
        create: (input: TaskInput) => Promise<TaskRecord>
        update: (id: string, patch: Partial<TaskInput>) => Promise<TaskRecord>
        remove: (id: string) => Promise<void>
        removeAll: () => Promise<void>
        run: (id: string) => Promise<void>
        stop: (id: string) => Promise<void>
        runAll: () => Promise<void>
        stopAll: () => Promise<void>
        import: (format: 'json' | 'csv', content: string) => Promise<TaskRecord[]>
        export: (format: 'json' | 'csv') => Promise<string>
      }
      proxies: {
        list: () => Promise<ProxyRecord[]>
        createMany: (inputs: ProxyInput[]) => Promise<ProxyRecord[]>
        removeAll: () => Promise<void>
        checkAll: (endpoint: string, timeoutMs?: number) => Promise<unknown>
        export: (format: 'json' | 'csv') => Promise<string>
      }
      profiles: {
        list: () => Promise<ProfileRecord[]>
        create: (input: ProfileInput) => Promise<ProfileRecord>
        update: (id: string, patch: Partial<ProfileInput>) => Promise<ProfileRecord>
        remove: (id: string) => Promise<void>
        saveSecrets: (profileId: string, secrets: Record<string, string>) => Promise<string[]>
      }
      siteSettings: {
        list: () => Promise<SiteSettingsRecord[]>
        get: (id: string) => Promise<SiteSettingsRecord | null>
        getBySiteKey: (siteKey: string) => Promise<SiteSettingsRecord | null>
        save: (input: SiteSettingsInput) => Promise<SiteSettingsRecord>
        remove: (id: string) => Promise<void>
      }
      logs: {
        list: (limit?: number) => Promise<LogRecord[]>
      }
      engine: {
        onStatus: (callback: (event: StatusEvent) => void) => () => void
        onAvailability: (callback: (event: AvailabilityEvent) => void) => () => void
        onLog: (callback: (event: LogRecord) => void) => () => void
      }
      app: {
        saveTextFile: (defaultPath: string, content: string) => Promise<string | null>
        openTextFile: () => Promise<{ path: string; content: string } | null>
      }
      settings: {
        getAll: () => Promise<Record<string, string | number | boolean>>
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string | null) => Promise<void>
        setAll: (settings: Record<string, string | number | boolean>) => Promise<void>
      }
      captcha: {
        isConfigured: () => Promise<boolean>
        getBalance: () => Promise<number | null>
        testSolve: () => Promise<{ success: boolean; token?: string; error?: string }>
      }
    }
  }
}

export {}
