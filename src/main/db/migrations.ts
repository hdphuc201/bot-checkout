export const migrations = [
  {
    id: '001_init',
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        appliedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT,
        url TEXT NOT NULL,
        siteKey TEXT,
        desiredQty INTEGER NOT NULL DEFAULT 1,
        intervalMs INTEGER NOT NULL DEFAULT 30000,
        groupName TEXT,
        proxyId TEXT,
        profileId TEXT,
        status TEXT NOT NULL DEFAULT 'IDLE',
        lastRunAt INTEGER,
        lastResult TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proxies (
        id TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT,
        passwordRef TEXT,
        status TEXT NOT NULL DEFAULT 'UNCHECKED',
        lastLatencyMs INTEGER,
        lastCheckedAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address1 TEXT,
        address2 TEXT,
        city TEXT,
        state TEXT,
        postal TEXT,
        country TEXT,
        notes TEXT,
        secretKeys TEXT NOT NULL DEFAULT '[]',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        taskId TEXT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        meta TEXT,
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(groupName);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
      CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(taskId);
    `
  },
  {
    id: '002_site_settings',
    up: `
      CREATE TABLE IF NOT EXISTS site_settings (
        id TEXT PRIMARY KEY,
        siteKey TEXT NOT NULL UNIQUE,
        loginUrl TEXT NOT NULL,
        username TEXT,
        passwordRef TEXT,
        cartUrl TEXT,
        checkoutUrl TEXT,
        extraConfig TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(siteKey);
    `
  },
  {
    id: '003_app_settings',
    up: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt INTEGER NOT NULL
      );
    `
  },
  {
    id: '004_proxy_groups',
    up: `
      ALTER TABLE proxies ADD COLUMN groupName TEXT;
      CREATE INDEX IF NOT EXISTS idx_proxies_group ON proxies(groupName);
    `
  }
]
