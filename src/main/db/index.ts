import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { migrations } from './migrations'
import type {
  LogRecord,
  ProfileInput,
  ProfileRecord,
  ProxyInput,
  ProxyRecord,
  SiteSettingsInput,
  SiteSettingsRecord,
  TaskInput,
  TaskRecord,
  TaskStatus
} from '../../shared/types'
import { randomUUID } from 'crypto'

let db: Database.Database | null = null

type ProfileRow = Omit<ProfileRecord, 'secretKeys'> & { secretKeys: string | null }
type LogRow = Omit<LogRecord, 'meta'> & { meta: string | null }

export function initDb(): Database.Database {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'automation-console.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  runMigrations(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

function runMigrations(database: Database.Database): void {
  database.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL)'
  )

  const applied = new Set(
    database
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row: { id: string }) => row.id)
  )

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    database.exec(migration.up)
    database
      .prepare('INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)')
      .run(migration.id, Date.now())
  }
}

function parseProfile(row: ProfileRow): ProfileRecord {
  return {
    ...row,
    secretKeys: row.secretKeys ? JSON.parse(row.secretKeys) : []
  }
}

function parseLog(row: LogRow): LogRecord {
  return {
    ...row,
    meta: row.meta ? JSON.parse(row.meta) : null
  }
}

export const taskStore = {
  list(): TaskRecord[] {
    return getDb().prepare('SELECT * FROM tasks ORDER BY createdAt DESC').all() as TaskRecord[]
  },
  get(id: string): TaskRecord | null {
    return (getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRecord) || null
  },
  create(input: TaskInput): TaskRecord {
    const now = Date.now()
    const record: TaskRecord = {
      id: input.id || randomUUID(),
      name: input.name ?? null,
      url: input.url,
      siteKey: input.siteKey ?? null,
      desiredQty: input.desiredQty ?? 1,
      intervalMs: input.intervalMs ?? 30000,
      groupName: input.groupName ?? null,
      proxyId: input.proxyId ?? null,
      profileId: input.profileId ?? null,
      status: 'IDLE',
      lastRunAt: null,
      lastResult: null,
      createdAt: now,
      updatedAt: now
    }

    getDb()
      .prepare(
        `INSERT INTO tasks (id, name, url, siteKey, desiredQty, intervalMs, groupName, proxyId, profileId, status, lastRunAt, lastResult, createdAt, updatedAt)
         VALUES (@id, @name, @url, @siteKey, @desiredQty, @intervalMs, @groupName, @proxyId, @profileId, @status, @lastRunAt, @lastResult, @createdAt, @updatedAt)`
      )
      .run(record)

    return record
  },
  update(
    id: string,
    patch: Partial<TaskInput> & {
      status?: TaskStatus
      lastRunAt?: number | null
      lastResult?: string | null
    }
  ): TaskRecord {
    const fields: string[] = []
    const params: Record<string, unknown> = { id }

    const mapField = (key: string, value: unknown): void => {
      fields.push(`${key} = @${key}`)
      params[key] = value
    }

    if (patch.name !== undefined) mapField('name', patch.name)
    if (patch.url !== undefined) mapField('url', patch.url)
    if (patch.siteKey !== undefined) mapField('siteKey', patch.siteKey)
    if (patch.desiredQty !== undefined) mapField('desiredQty', patch.desiredQty)
    if (patch.intervalMs !== undefined) mapField('intervalMs', patch.intervalMs)
    if (patch.groupName !== undefined) mapField('groupName', patch.groupName)
    if (patch.proxyId !== undefined) mapField('proxyId', patch.proxyId)
    if (patch.profileId !== undefined) mapField('profileId', patch.profileId)
    if (patch.status !== undefined) mapField('status', patch.status)
    if (patch.lastRunAt !== undefined) mapField('lastRunAt', patch.lastRunAt)
    if (patch.lastResult !== undefined) mapField('lastResult', patch.lastResult)

    mapField('updatedAt', Date.now())

    if (fields.length > 0) {
      getDb()
        .prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = @id`)
        .run(params)
    }

    return this.get(id) as TaskRecord
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
  },
  removeAll(): void {
    getDb().prepare('DELETE FROM tasks').run()
  }
}

export const proxyStore = {
  list(): ProxyRecord[] {
    return getDb().prepare('SELECT * FROM proxies ORDER BY createdAt DESC').all() as ProxyRecord[]
  },
  createMany(inputs: Array<ProxyInput & { passwordRef?: string | null }>): ProxyRecord[] {
    const now = Date.now()
    const insert = getDb().prepare(
      `INSERT INTO proxies (id, host, port, username, passwordRef, status, lastLatencyMs, lastCheckedAt, createdAt, updatedAt)
       VALUES (@id, @host, @port, @username, @passwordRef, @status, @lastLatencyMs, @lastCheckedAt, @createdAt, @updatedAt)`
    )
    const records: ProxyRecord[] = inputs.map((input) => ({
      id: input.id || randomUUID(),
      host: input.host,
      port: input.port,
      username: input.username ?? null,
      passwordRef: input.passwordRef ?? null,
      status: 'UNCHECKED',
      lastLatencyMs: null,
      lastCheckedAt: null,
      createdAt: now,
      updatedAt: now
    }))

    const tx = getDb().transaction(() => {
      for (const record of records) insert.run(record)
    })
    tx()
    return records
  },
  update(id: string, patch: Partial<ProxyRecord>): ProxyRecord {
    const fields: string[] = []
    const params: Record<string, unknown> = { id }

    const mapField = (key: string, value: unknown): void => {
      fields.push(`${key} = @${key}`)
      params[key] = value
    }

    if (patch.host !== undefined) mapField('host', patch.host)
    if (patch.port !== undefined) mapField('port', patch.port)
    if (patch.username !== undefined) mapField('username', patch.username)
    if (patch.passwordRef !== undefined) mapField('passwordRef', patch.passwordRef)
    if (patch.status !== undefined) mapField('status', patch.status)
    if (patch.lastLatencyMs !== undefined) mapField('lastLatencyMs', patch.lastLatencyMs)
    if (patch.lastCheckedAt !== undefined) mapField('lastCheckedAt', patch.lastCheckedAt)

    mapField('updatedAt', Date.now())

    if (fields.length > 0) {
      getDb()
        .prepare(`UPDATE proxies SET ${fields.join(', ')} WHERE id = @id`)
        .run(params)
    }

    return getDb().prepare('SELECT * FROM proxies WHERE id = ?').get(id) as ProxyRecord
  },
  removeAll(): void {
    getDb().prepare('DELETE FROM proxies').run()
  }
}

export const profileStore = {
  list(): ProfileRecord[] {
    const rows = getDb()
      .prepare('SELECT * FROM profiles ORDER BY createdAt DESC')
      .all() as ProfileRow[]
    return rows.map(parseProfile)
  },
  get(id: string): ProfileRecord | null {
    const row = getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as
      | ProfileRow
      | undefined
    return row ? parseProfile(row) : null
  },
  create(input: ProfileInput): ProfileRecord {
    const now = Date.now()
    const record: ProfileRecord = {
      id: input.id || randomUUID(),
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address1: input.address1 ?? null,
      address2: input.address2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postal: input.postal ?? null,
      country: input.country ?? null,
      notes: input.notes ?? null,
      secretKeys: [],
      createdAt: now,
      updatedAt: now
    }

    getDb()
      .prepare(
        `INSERT INTO profiles (id, name, email, phone, address1, address2, city, state, postal, country, notes, secretKeys, createdAt, updatedAt)
         VALUES (@id, @name, @email, @phone, @address1, @address2, @city, @state, @postal, @country, @notes, @secretKeys, @createdAt, @updatedAt)`
      )
      .run({ ...record, secretKeys: JSON.stringify(record.secretKeys) })

    return record
  },
  update(id: string, patch: Partial<ProfileInput> & { secretKeys?: string[] }): ProfileRecord {
    const fields: string[] = []
    const params: Record<string, unknown> = { id }

    const mapField = (key: string, value: unknown): void => {
      fields.push(`${key} = @${key}`)
      params[key] = value
    }

    if (patch.name !== undefined) mapField('name', patch.name)
    if (patch.email !== undefined) mapField('email', patch.email)
    if (patch.phone !== undefined) mapField('phone', patch.phone)
    if (patch.address1 !== undefined) mapField('address1', patch.address1)
    if (patch.address2 !== undefined) mapField('address2', patch.address2)
    if (patch.city !== undefined) mapField('city', patch.city)
    if (patch.state !== undefined) mapField('state', patch.state)
    if (patch.postal !== undefined) mapField('postal', patch.postal)
    if (patch.country !== undefined) mapField('country', patch.country)
    if (patch.notes !== undefined) mapField('notes', patch.notes)
    if (patch.secretKeys !== undefined) mapField('secretKeys', JSON.stringify(patch.secretKeys))

    mapField('updatedAt', Date.now())

    if (fields.length > 0) {
      getDb()
        .prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = @id`)
        .run(params)
    }

    return this.get(id) as ProfileRecord
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id)
  }
}

export const logStore = {
  list(limit = 200): LogRecord[] {
    const rows = getDb()
      .prepare('SELECT * FROM logs ORDER BY createdAt DESC LIMIT ?')
      .all(limit) as LogRow[]
    return rows.map(parseLog)
  },
  add(entry: Omit<LogRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): LogRecord {
    const record: LogRecord = {
      id: entry.id || randomUUID(),
      taskId: entry.taskId ?? null,
      level: entry.level,
      message: entry.message,
      meta: entry.meta ?? null,
      createdAt: entry.createdAt ?? Date.now()
    }

    getDb()
      .prepare(
        'INSERT INTO logs (id, taskId, level, message, meta, createdAt) VALUES (@id, @taskId, @level, @message, @meta, @createdAt)'
      )
      .run({ ...record, meta: record.meta ? JSON.stringify(record.meta) : null })

    return record
  }
}

type SiteSettingsRow = Omit<SiteSettingsRecord, 'extraConfig'> & { extraConfig: string | null }

function parseSiteSettings(row: SiteSettingsRow): SiteSettingsRecord {
  return {
    ...row,
    extraConfig: row.extraConfig ? JSON.parse(row.extraConfig) : null
  }
}

export const siteSettingsStore = {
  list(): SiteSettingsRecord[] {
    const rows = getDb()
      .prepare('SELECT * FROM site_settings ORDER BY createdAt DESC')
      .all() as SiteSettingsRow[]
    return rows.map(parseSiteSettings)
  },
  get(id: string): SiteSettingsRecord | null {
    const row = getDb().prepare('SELECT * FROM site_settings WHERE id = ?').get(id) as
      | SiteSettingsRow
      | undefined
    return row ? parseSiteSettings(row) : null
  },
  getBySiteKey(siteKey: string): SiteSettingsRecord | null {
    const row = getDb().prepare('SELECT * FROM site_settings WHERE siteKey = ?').get(siteKey) as
      | SiteSettingsRow
      | undefined
    return row ? parseSiteSettings(row) : null
  },
  upsert(input: SiteSettingsInput & { passwordRef?: string | null }): SiteSettingsRecord {
    const now = Date.now()
    const existing = this.getBySiteKey(input.siteKey)

    if (existing) {
      const fields: string[] = []
      const params: Record<string, unknown> = { id: existing.id }

      const mapField = (key: string, value: unknown): void => {
        fields.push(`${key} = @${key}`)
        params[key] = value
      }

      if (input.loginUrl !== undefined) mapField('loginUrl', input.loginUrl)
      if (input.username !== undefined) mapField('username', input.username)
      if (input.passwordRef !== undefined) mapField('passwordRef', input.passwordRef)
      if (input.cartUrl !== undefined) mapField('cartUrl', input.cartUrl)
      if (input.checkoutUrl !== undefined) mapField('checkoutUrl', input.checkoutUrl)
      if (input.extraConfig !== undefined)
        mapField('extraConfig', JSON.stringify(input.extraConfig))

      mapField('updatedAt', now)

      if (fields.length > 0) {
        getDb()
          .prepare(`UPDATE site_settings SET ${fields.join(', ')} WHERE id = @id`)
          .run(params)
      }

      return this.get(existing.id) as SiteSettingsRecord
    }

    const record: SiteSettingsRecord = {
      id: input.id || randomUUID(),
      siteKey: input.siteKey,
      loginUrl: input.loginUrl,
      username: input.username ?? null,
      passwordRef: input.passwordRef ?? null,
      cartUrl: input.cartUrl ?? null,
      checkoutUrl: input.checkoutUrl ?? null,
      extraConfig: input.extraConfig ?? null,
      createdAt: now,
      updatedAt: now
    }

    getDb()
      .prepare(
        `INSERT INTO site_settings (id, siteKey, loginUrl, username, passwordRef, cartUrl, checkoutUrl, extraConfig, createdAt, updatedAt)
         VALUES (@id, @siteKey, @loginUrl, @username, @passwordRef, @cartUrl, @checkoutUrl, @extraConfig, @createdAt, @updatedAt)`
      )
      .run({
        ...record,
        extraConfig: record.extraConfig ? JSON.stringify(record.extraConfig) : null
      })

    return record
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM site_settings WHERE id = ?').run(id)
  }
}

// Global app settings store (key-value pairs)
export interface AppSettings {
  captchaApiKey?: string
  captchaService?: 'twocaptcha' | 'anticaptcha' | 'capmonster'
  headlessBrowser?: boolean
  defaultIntervalMs?: number
  [key: string]: string | number | boolean | undefined
}

export const settingsStore = {
  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string | null }
      | undefined
    return row?.value ?? null
  },

  set(key: string, value: string | null): void {
    const now = Date.now()
    getDb()
      .prepare(
        `INSERT INTO app_settings (key, value, updatedAt) 
         VALUES (?, ?, ?) 
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
      )
      .run(key, value, now)
  },

  getAll(): AppSettings {
    const rows = getDb().prepare('SELECT key, value FROM app_settings').all() as {
      key: string
      value: string | null
    }[]

    const settings: AppSettings = {}
    for (const row of rows) {
      if (row.value !== null) {
        // Try to parse JSON values
        try {
          settings[row.key] = JSON.parse(row.value)
        } catch {
          settings[row.key] = row.value
        }
      }
    }
    return settings
  },

  setAll(settings: Partial<AppSettings>): void {
    const now = Date.now()
    const stmt = getDb().prepare(
      `INSERT INTO app_settings (key, value, updatedAt) 
       VALUES (?, ?, ?) 
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
    )

    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        const strValue = typeof value === 'string' ? value : JSON.stringify(value)
        stmt.run(key, strValue, now)
      }
    }
  },

  remove(key: string): void {
    getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key)
  }
}
