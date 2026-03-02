export const IPC_CHANNELS = {
  tasks: {
    list: 'tasks:list',
    create: 'tasks:create',
    update: 'tasks:update',
    remove: 'tasks:remove',
    removeAll: 'tasks:removeAll',
    run: 'tasks:run',
    stop: 'tasks:stop',
    runAll: 'tasks:runAll',
    stopAll: 'tasks:stopAll',
    import: 'tasks:import',
    export: 'tasks:export'
  },
  proxies: {
    list: 'proxies:list',
    createMany: 'proxies:createMany',
    removeAll: 'proxies:removeAll',
    checkAll: 'proxies:checkAll',
    export: 'proxies:export'
  },
  profiles: {
    list: 'profiles:list',
    create: 'profiles:create',
    update: 'profiles:update',
    remove: 'profiles:remove',
    saveSecrets: 'profiles:saveSecrets'
  },
  siteSettings: {
    list: 'siteSettings:list',
    get: 'siteSettings:get',
    getBySiteKey: 'siteSettings:getBySiteKey',
    save: 'siteSettings:save',
    remove: 'siteSettings:remove'
  },
  logs: {
    list: 'logs:list'
  },
  engine: {
    status: 'engine:status',
    availability: 'engine:availability',
    log: 'engine:log'
  },
  settings: {
    getAll: 'settings:getAll',
    get: 'settings:get',
    set: 'settings:set',
    setAll: 'settings:setAll'
  },
  captcha: {
    isConfigured: 'captcha:isConfigured',
    getBalance: 'captcha:getBalance',
    testSolve: 'captcha:testSolve'
  },
  app: {
    saveTextFile: 'app:saveTextFile',
    openTextFile: 'app:openTextFile'
  }
} as const
