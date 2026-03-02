import {
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactElement,
  type ReactNode
} from 'react'
import {
  Play,
  Square,
  Trash2,
  Plus,
  Upload,
  Wifi,
  User,
  LayoutList,
  Settings,
  RefreshCw,
  Download,
  ExternalLink,
  Pencil,
  AlertTriangle,
  X,
  FileText
} from 'lucide-react'
import type {
  AvailabilityEvent,
  LogRecord,
  ProfileRecord,
  ProxyRecord,
  SiteSettingsRecord,
  TaskRecord,
  TaskStatus
} from '../../shared/types'

interface SidebarItemProps {
  icon: ComponentType<{ size?: number }>
  label: string
  active: boolean
  onClick: () => void
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps): ReactElement => (
  <div
    onClick={onClick}
    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-1
    ${active ? 'bg-slate-100 text-slate-950 shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </div>
)

type ButtonVariant = 'primary' | 'success' | 'danger' | 'warning' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  icon?: ComponentType<{ size?: number }>
  className?: string
}

const Button = ({
  children,
  variant = 'primary',
  onClick,
  icon: Icon,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps): ReactElement => {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-cyan-600 hover:bg-cyan-500 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white',
    warning: 'bg-amber-600 hover:bg-amber-500 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 border border-slate-700'
  }
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${variants[variant]} flex items-center gap-2 px-4 py-2 rounded-md font-semibold text-xs shadow-md transition-all active:scale-95 ${className}`}
      {...rest}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  )
}

const StatusBadge = ({ status }: { status: TaskStatus | string }): ReactElement => {
  const styles: Record<string, string> = {
    IDLE: 'bg-slate-700 text-slate-200',
    SCHEDULED: 'bg-indigo-900/50 text-indigo-300 border border-indigo-700',
    RUNNING: 'bg-blue-900/50 text-blue-300 border border-blue-700',
    BACKOFF: 'bg-amber-900/50 text-amber-300 border border-amber-700',
    AVAILABLE: 'bg-emerald-600 text-white',
    SUCCESS: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
    ERROR: 'bg-rose-900/50 text-rose-300 border border-rose-700',
    STOPPED: 'bg-slate-800 text-slate-400',
    ALIVE: 'bg-emerald-500 text-white',
    DEAD: 'bg-rose-500 text-white',
    UNCHECKED: 'bg-slate-600 text-slate-200'
  }
  return (
    <span
      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${styles[status] || styles.IDLE}`}
    >
      {status}
    </span>
  )
}

const defaultTaskForm = {
  name: '',
  url: '',
  siteKey: '',
  desiredQty: 1,
  intervalMs: 10000,
  groupName: '',
  proxyId: '',
  profileId: ''
}

// Confirmation Dialog Component
interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'warning'
}

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger'
}: ConfirmDialogProps): ReactElement | null => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-start gap-4">
          <div
            className={`p-2 rounded-full ${variant === 'danger' ? 'bg-rose-500/20' : 'bg-amber-500/20'}`}
          >
            <AlertTriangle
              className={variant === 'danger' ? 'text-rose-400' : 'text-amber-400'}
              size={24}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
            <p className="text-sm text-slate-400">{message}</p>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={variant === 'danger' ? 'danger' : 'warning'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}

function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<
    'TASKS' | 'PROXIES' | 'PROFILES' | 'SETTINGS' | 'LOGS'
  >('TASKS')

  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [proxies, setProxies] = useState<ProxyRecord[]>([])
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [siteSettings, setSiteSettings] = useState<SiteSettingsRecord[]>([])
  const [actions, setActions] = useState<AvailabilityEvent[]>([])
  const [logs, setLogs] = useState<LogRecord[]>([])

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const [taskForm, setTaskForm] = useState({ ...defaultTaskForm })
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)

  const [proxyInput, setProxyInput] = useState('')
  const [proxyEndpoint, setProxyEndpoint] = useState('https://httpbin.org/ip')

  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    postal: '',
    country: '',
    notes: ''
  })
  const [profileSecrets, setProfileSecrets] = useState({ apiToken: '', sessionToken: '' })
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)

  // Askul Settings form
  const [askulSettings, setAskulSettings] = useState({
    loginUrl: 'https://www.askul.co.jp/webapp/shops-club/servlet/YLogonSSLView?transitionURL=%2F',
    username: '',
    password: '',
    cartUrl: 'https://www.askul.co.jp/odr/order/shoppingCartView/',
    checkoutUrl: 'https://www.askul.co.jp/odr/order/orderProcessView/'
  })

  const api = (window as Window & { api?: Window['api'] }).api
  console.log('api', api)
  const apiAvailable = Boolean(api)

  const refreshTasks = async (): Promise<void> => {
    if (!api) return
    setTasks(await api.tasks.list())
  }
  const refreshProxies = async (): Promise<void> => {
    if (!api) return
    setProxies(await api.proxies.list())
  }
  const refreshProfiles = async (): Promise<void> => {
    if (!api) return
    setProfiles(await api.profiles.list())
  }
  const refreshSiteSettings = async (): Promise<void> => {
    if (!api) return
    setSiteSettings(await api.siteSettings.list())
    // Load Askul settings if exists
    const askul = await api.siteSettings.getBySiteKey('askul')
    if (askul) {
      setAskulSettings((prev) => ({
        ...prev,
        loginUrl: askul.loginUrl,
        username: askul.username || '',
        cartUrl: askul.cartUrl || prev.cartUrl,
        checkoutUrl: askul.checkoutUrl || prev.checkoutUrl
      }))
    }
  }
  const refreshLogs = async (): Promise<void> => {
    if (!api) return
    setLogs(await api.logs.list(200))
  }

  useEffect(() => {
    if (!api) {
      console.warn('Electron preload API not available. Open the app via Electron.')
      return
    }
    const loadInitialData = async (): Promise<void> => {
      await refreshTasks()
      await refreshProxies()
      await refreshProfiles()
      await refreshSiteSettings()
      await refreshLogs()
    }
    void loadInitialData()

    const offStatus = api.engine.onStatus((event) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === event.taskId
            ? {
                ...task,
                status: event.status,
                lastResult: event.message,
                lastRunAt: event.lastRunAt ?? task.lastRunAt
              }
            : task
        )
      )
    })

    const offAvailability = api.engine.onAvailability((event) => {
      setActions((prev) => [event, ...prev].slice(0, 10))
    })

    const offLog = api.engine.onLog((event) => {
      setLogs((prev) => [{ ...event }, ...prev].slice(0, 200))
    })

    return () => {
      offStatus()
      offAvailability()
      offLog()
    }
  }, [api])

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === editingProfileId) ?? null,
    [profiles, editingProfileId]
  )

  const handleTaskSubmit = async (): Promise<void> => {
    if (!taskForm.url) return

    const payload = {
      name: taskForm.name || null,
      url: taskForm.url,
      siteKey: taskForm.siteKey || null,
      desiredQty: Number(taskForm.desiredQty || 1),
      intervalMs: Number(taskForm.intervalMs || 10000),
      groupName: taskForm.groupName || null,
      proxyId: taskForm.proxyId || null,
      profileId: taskForm.profileId || null
    }

    if (editingTaskId) {
      if (!api) return
      await api.tasks.update(editingTaskId, payload)
    } else {
      if (!api) return
      await api.tasks.create(payload)
    }

    setTaskForm({ ...defaultTaskForm })
    setEditingTaskId(null)
    await refreshTasks()
  }

  const handleTaskEdit = (task: TaskRecord): void => {
    setEditingTaskId(task.id)
    setTaskForm({
      name: task.name ?? '',
      url: task.url,
      siteKey: task.siteKey ?? '',
      desiredQty: task.desiredQty,
      intervalMs: task.intervalMs,
      groupName: task.groupName ?? '',
      proxyId: task.proxyId ?? '',
      profileId: task.profileId ?? ''
    })
  }

  const handleTaskDelete = async (taskId: string): Promise<void> => {
    if (!api) return
    await api.tasks.remove(taskId)
    await refreshTasks()
  }

  const handleTaskImport = async (): Promise<void> => {
    if (!api) return
    const file = await api.app.openTextFile()
    if (!file) return
    const format = file.path.endsWith('.csv') ? 'csv' : 'json'
    await api.tasks.import(format, file.content)
    await refreshTasks()
  }

  const handleTaskExport = async (format: 'json' | 'csv'): Promise<void> => {
    if (!api) return
    const content = await api.tasks.export(format)
    await api.app.saveTextFile(`tasks.${format}`, content)
  }

  const handleProxyImport = async (): Promise<void> => {
    const lines = proxyInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) return

    const inputs = lines.map((line) => {
      const parts = line.split(':')
      return {
        host: parts[0],
        port: Number(parts[1]),
        username: parts[2] || null,
        password: parts[3] || null
      }
    })

    if (!api) return
    await api.proxies.createMany(inputs)
    setProxyInput('')
    await refreshProxies()
  }

  const handleProxyCheck = async (): Promise<void> => {
    if (!proxyEndpoint) return
    if (!api) return
    await api.proxies.checkAll(proxyEndpoint)
    await refreshProxies()
  }

  const handleProxyExport = async (format: 'json' | 'csv'): Promise<void> => {
    if (!api) return
    const content = await api.proxies.export(format)
    await api.app.saveTextFile(`proxies.${format}`, content)
  }

  const handleProfileSave = async (): Promise<void> => {
    if (!profileForm.name) return

    let profileId = editingProfileId

    if (editingProfileId) {
      if (!api) return
      await api.profiles.update(editingProfileId, profileForm)
    } else {
      if (!api) return
      const created = await api.profiles.create(profileForm)
      profileId = created.id
      setEditingProfileId(created.id)
    }

    if (profileId && (profileSecrets.apiToken || profileSecrets.sessionToken)) {
      if (!api) return
      await api.profiles.saveSecrets(profileId, {
        apiToken: profileSecrets.apiToken,
        sessionToken: profileSecrets.sessionToken
      })
      setProfileSecrets({ apiToken: '', sessionToken: '' })
    }

    await refreshProfiles()
  }

  const handleProfileSelect = (profile: ProfileRecord): void => {
    setEditingProfileId(profile.id)
    setProfileForm({
      name: profile.name,
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      address1: profile.address1 ?? '',
      address2: profile.address2 ?? '',
      city: profile.city ?? '',
      state: profile.state ?? '',
      postal: profile.postal ?? '',
      country: profile.country ?? '',
      notes: profile.notes ?? ''
    })
  }

  const handleProfileDelete = async (profileId: string): Promise<void> => {
    if (!api) return
    await api.profiles.remove(profileId)
    if (editingProfileId === profileId) {
      setEditingProfileId(null)
      setProfileForm({
        name: '',
        email: '',
        phone: '',
        address1: '',
        address2: '',
        city: '',
        state: '',
        postal: '',
        country: '',
        notes: ''
      })
    }
    await refreshProfiles()
  }

  const renderTasks = (): ReactElement => (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 bg-slate-900/70 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              {editingTaskId ? 'Edit Task' : 'Create Task'}
            </h3>
            {editingTaskId && (
              <Button
                variant="ghost"
                className="px-2 py-1"
                onClick={() => {
                  setEditingTaskId(null)
                  setTaskForm({ ...defaultTaskForm })
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <div className="space-y-3 text-xs h-[40vh] overflow-y-auto">
            <div>
              <label className="text-slate-400">Name</label>
              <input
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                value={taskForm.name}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Task name"
              />
            </div>
            <div>
              <label className="text-slate-400">URL</label>
              <input
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                value={taskForm.url}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://target.com/product"
              />
            </div>
            <div>
              <label className="text-slate-400">Site Key</label>
              <input
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                value={taskForm.siteKey}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, siteKey: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400">Qty</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                  value={taskForm.desiredQty}
                  onChange={(e) =>
                    setTaskForm((prev) => ({ ...prev, desiredQty: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="text-slate-400">Interval (ms)</label>
                <input
                  type="number"
                  min={1000}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                  value={taskForm.intervalMs}
                  onChange={(e) =>
                    setTaskForm((prev) => ({ ...prev, intervalMs: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-slate-400">Group</label>
              <input
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                value={taskForm.groupName}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, groupName: e.target.value }))}
                placeholder="Group name"
              />
            </div>
            <div>
              <label className="text-slate-400">Profile</label>
              <select
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                value={taskForm.profileId}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, profileId: e.target.value }))}
              >
                <option value="">None</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400">Proxy</label>
              <select
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                value={taskForm.proxyId}
                onChange={(e) => setTaskForm((prev) => ({ ...prev, proxyId: e.target.value }))}
              >
                <option value="">None</option>
                {proxies.map((proxy) => (
                  <option key={proxy.id} value={proxy.id}>
                    {proxy.host}:{proxy.port}
                  </option>
                ))}
              </select>
            </div>
            <Button className="w-full justify-center" icon={Plus} onClick={handleTaskSubmit}>
              {editingTaskId ? 'Update Task' : 'Create Task'}
            </Button>
          </div>
        </div>

        <div className="col-span-8 bg-slate-900/70 border border-slate-800 rounded-lg p-4 overflow-y-auto h-[50vh]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Action Center</h3>
            <span className="text-xs text-slate-500">Latest availability signals</span>
          </div>
          <div className="space-y-3">
            {actions.length === 0 && (
              <div className="text-xs text-slate-500">No availability events yet.</div>
            )}
            {actions.map((action, index) => (
              <div
                key={`${action.taskId}-${index}`}
                className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded px-3 py-2"
              >
                <div>
                  <div className="text-xs font-semibold text-emerald-400">AVAILABLE</div>
                  <div className="text-xs text-slate-300 truncate max-w-[360px]">
                    {action.message}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  icon={ExternalLink}
                  onClick={() => window.open(action.actionUrl)}
                >
                  Open URL
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 p-4 bg-slate-900/70 border border-slate-800 rounded-lg shadow-sm">
        <Button variant="success" onClick={() => api?.tasks.runAll()} icon={Play}>
          Run All
        </Button>
        <Button variant="warning" onClick={() => api?.tasks.stopAll()} icon={Square}>
          Stop All
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmDialog({
              isOpen: true,
              title: 'Delete All Tasks',
              message: 'Are you sure you want to delete all tasks? This action cannot be undone.',
              onConfirm: async () => {
                if (!api) return
                await api.tasks.removeAll()
                await refreshTasks()
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
              }
            })
          }}
          icon={Trash2}
        >
          Delete All
        </Button>
        <div className="w-px bg-slate-700 mx-2"></div>
        <Button variant="secondary" onClick={handleTaskImport} icon={Upload}>
          Import
        </Button>
        <Button variant="secondary" onClick={() => handleTaskExport('json')} icon={Download}>
          Export JSON
        </Button>
        <Button variant="secondary" onClick={() => handleTaskExport('csv')} icon={Download}>
          Export CSV
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-slate-900/70 rounded-lg border border-slate-800 shadow-inner">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-950 sticky top-0 z-10 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="p-4 border-b border-slate-800">Name</th>
              <th className="p-4 border-b border-slate-800">URL</th>
              <th className="p-4 border-b border-slate-800">Group</th>
              <th className="p-4 border-b border-slate-800">Interval</th>
              <th className="p-4 border-b border-slate-800">Qty</th>
              <th className="p-4 border-b border-slate-800">Profile</th>
              <th className="p-4 border-b border-slate-800">Proxy</th>
              <th className="p-4 border-b border-slate-800">Status</th>
              <th className="p-4 border-b border-slate-800 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-800">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-slate-900/80 transition-colors group">
                <td className="p-4 font-medium text-slate-200">{task.name || 'Untitled'}</td>
                <td className="p-4 text-slate-400 truncate max-w-[200px]">{task.url}</td>
                <td className="p-4 text-slate-400">{task.groupName || '-'}</td>
                <td className="p-4 text-slate-400">{task.intervalMs} ms</td>
                <td className="p-4 text-slate-400">{task.desiredQty}</td>
                <td className="p-4 text-cyan-300">
                  {profiles.find((profile) => profile.id === task.profileId)?.name || 'None'}
                </td>
                <td className="p-4 text-slate-400 text-xs">
                  {proxies.find((proxy) => proxy.id === task.proxyId)
                    ? `${proxies.find((proxy) => proxy.id === task.proxyId)?.host}:${
                        proxies.find((proxy) => proxy.id === task.proxyId)?.port
                      }`
                    : 'None'}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={task.status} />
                    <span className="text-xs text-slate-500 truncate max-w-[160px]">
                      {task.lastResult || ''}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => api?.tasks.run(task.id)}
                      className="p-1 hover:text-emerald-400"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => api?.tasks.stop(task.id)}
                      className="p-1 hover:text-amber-400"
                    >
                      <Square size={16} />
                    </button>
                    <button
                      onClick={() => handleTaskEdit(task)}
                      className="p-1 hover:text-cyan-400"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleTaskDelete(task.id)}
                      className="p-1 hover:text-rose-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-slate-500">
                  No tasks active. Create a task to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderProxies = (): ReactElement => (
    <div className="flex gap-6 h-full">
      <div className="w-1/3 flex flex-col gap-4">
        <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-800 flex flex-col h-full">
          <h3 className="font-bold text-slate-200 mb-2 flex items-center gap-2">
            <Upload size={18} /> Import Proxies
          </h3>
          <textarea
            className="flex-1 bg-slate-950 border border-slate-800 rounded p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500 resize-none"
            placeholder="host:port:user:pass\nproxy:port:user:pass"
            value={proxyInput}
            onChange={(e) => setProxyInput(e.target.value)}
          ></textarea>
          <Button className="mt-4" onClick={handleProxyImport}>
            Add to List
          </Button>
        </div>

        <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-400 mb-2">Health check endpoint</div>
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200"
            value={proxyEndpoint}
            onChange={(e) => setProxyEndpoint(e.target.value)}
            placeholder="https://httpbin.org/ip"
          />
          <Button
            className="mt-3 w-full justify-center"
            variant="secondary"
            icon={RefreshCw}
            onClick={handleProxyCheck}
          >
            Check All
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-slate-900/70 rounded-lg border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80">
          <div className="font-bold text-slate-200">Proxy List ({proxies.length})</div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                if (!api) return
                await api.proxies.removeAll()
                await refreshProxies()
              }}
              icon={Trash2}
            >
              Clear
            </Button>
            <Button variant="secondary" onClick={() => handleProxyExport('json')} icon={Download}>
              Export JSON
            </Button>
            <Button variant="secondary" onClick={() => handleProxyExport('csv')} icon={Download}>
              Export CSV
            </Button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-500 text-xs uppercase font-bold sticky top-0">
              <tr>
                <th className="p-3">Host</th>
                <th className="p-3">Port</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Latency (ms)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {proxies.map((proxy) => (
                <tr key={proxy.id} className="hover:bg-slate-900/80">
                  <td className="p-3 font-mono text-slate-300">{proxy.host}</td>
                  <td className="p-3 font-mono text-slate-400">{proxy.port}</td>
                  <td className="p-3">
                    <StatusBadge status={proxy.status} />
                  </td>
                  <td className="p-3 text-right font-mono text-slate-400">
                    {proxy.lastLatencyMs ?? '-'}
                  </td>
                </tr>
              ))}
              {proxies.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-500">
                    No proxies imported yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const renderProfiles = (): ReactElement => (
    <div className="grid grid-cols-3 gap-6 h-full">
      <div className="col-span-2 bg-slate-900/70 p-6 rounded-lg border border-slate-800">
        <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
          <User className="text-cyan-400" /> Profile Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Profile Name</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.name}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Email</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.email}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Phone</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.phone}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Country</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.country}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, country: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-slate-400 mb-1">Address 1</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.address1}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, address1: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-slate-400 mb-1">Address 2</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.address2}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, address2: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">City</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.city}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">State</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.state}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, state: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Postal</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              value={profileForm.postal}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, postal: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-slate-400 mb-1">Notes</label>
            <textarea
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 h-20"
              value={profileForm.notes}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-slate-300 mb-2">
            Secrets (stored in OS keychain)
          </h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">API Token</label>
              <input
                type="password"
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                value={profileSecrets.apiToken}
                onChange={(e) =>
                  setProfileSecrets((prev) => ({ ...prev, apiToken: e.target.value }))
                }
                placeholder="Stored securely"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Session Token</label>
              <input
                type="password"
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                value={profileSecrets.sessionToken}
                onChange={(e) =>
                  setProfileSecrets((prev) => ({ ...prev, sessionToken: e.target.value }))
                }
                placeholder="Stored securely"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleProfileSave} icon={Plus}>
            {editingProfileId ? 'Update Profile' : 'Create Profile'}
          </Button>
          {editingProfileId && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingProfileId(null)
                setProfileForm({
                  name: '',
                  email: '',
                  phone: '',
                  address1: '',
                  address2: '',
                  city: '',
                  state: '',
                  postal: '',
                  country: '',
                  notes: ''
                })
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="bg-slate-900/70 p-6 rounded-lg border border-slate-800">
        <h3 className="font-bold text-lg text-white mb-4">Profiles</h3>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className={`flex justify-between items-center bg-slate-950 p-3 rounded border border-slate-800 cursor-pointer ${
                editingProfileId === profile.id ? 'ring-1 ring-cyan-400' : ''
              }`}
            >
              <div onClick={() => handleProfileSelect(profile)}>
                <div className="font-bold text-white text-sm">{profile.name}</div>
                <div className="text-xs text-slate-500">{profile.email || 'No email'}</div>
              </div>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                onClick={() => handleProfileDelete(profile.id)}
              >
                Delete
              </Button>
            </div>
          ))}
          {profiles.length === 0 && (
            <div className="text-xs text-slate-500">No profiles created.</div>
          )}
        </div>
        {selectedProfile && (
          <div className="mt-4 text-xs text-slate-400">
            Stored secrets: {selectedProfile.secretKeys.join(', ') || 'None'}
          </div>
        )}
      </div>
    </div>
  )

  const renderLogs = (): ReactElement => (
    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Engine Logs</h3>
        <Button variant="secondary" icon={RefreshCw} onClick={refreshLogs}>
          Refresh
        </Button>
      </div>
      <div className="space-y-2 text-xs">
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-3 border border-slate-800 rounded p-2 bg-slate-950"
          >
            <div className="uppercase text-[10px] text-slate-500">{log.level}</div>
            <div className="flex-1 text-slate-300">
              <div>{log.message}</div>
              {log.taskId && <div className="text-[10px] text-slate-500">Task: {log.taskId}</div>}
            </div>
            <div className="text-[10px] text-slate-500">
              {new Date(log.createdAt).toLocaleTimeString()}
            </div>
          </div>
        ))}
        {logs.length === 0 && <div className="text-xs text-slate-500">No logs yet.</div>}
      </div>
    </div>
  )

  const handleSaveAskulSettings = async (): Promise<void> => {
    if (!api) return
    await api.siteSettings.save({
      siteKey: 'askul',
      loginUrl: askulSettings.loginUrl,
      username: askulSettings.username,
      password: askulSettings.password,
      cartUrl: askulSettings.cartUrl,
      checkoutUrl: askulSettings.checkoutUrl
    })
    setAskulSettings((prev) => ({ ...prev, password: '' }))
    await refreshSiteSettings()
  }

  const renderSettings = (): ReactElement => (
    <div className="flex flex-col gap-6 h-full overflow-auto">
      {/* Askul Settings */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <FileText className="text-orange-400" size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Askul.co.jp Settings</h3>
            <p className="text-xs text-slate-500">
              Configure login credentials for automated purchasing
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="col-span-2">
            <label className="block text-slate-400 mb-1">Login URL</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200"
              value={askulSettings.loginUrl}
              onChange={(e) => setAskulSettings((prev) => ({ ...prev, loginUrl: e.target.value }))}
              placeholder="https://www.askul.co.jp/webapp/shops-club/servlet/YLogonSSLView"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Email / Username</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200"
              value={askulSettings.username}
              onChange={(e) => setAskulSettings((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="your-email@example.com"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Password</label>
            <input
              type="password"
              className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200"
              value={askulSettings.password}
              onChange={(e) => setAskulSettings((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Enter password to update"
            />
            <p className="text-[10px] text-slate-500 mt-1">Leave blank to keep existing password</p>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Cart URL</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200"
              value={askulSettings.cartUrl}
              onChange={(e) => setAskulSettings((prev) => ({ ...prev, cartUrl: e.target.value }))}
              placeholder="https://www.askul.co.jp/odr/order/shoppingCartView/"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Checkout URL</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200"
              value={askulSettings.checkoutUrl}
              onChange={(e) =>
                setAskulSettings((prev) => ({ ...prev, checkoutUrl: e.target.value }))
              }
              placeholder="https://www.askul.co.jp/odr/order/orderProcessView/"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button onClick={handleSaveAskulSettings} icon={Plus}>
            Save Askul Settings
          </Button>
          {siteSettings.find((s) => s.siteKey === 'askul') && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              ✓ Credentials saved
            </span>
          )}
        </div>
      </div>

      {/* Saved Site Settings List */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-6">
        <h3 className="font-bold text-white mb-4">Saved Site Configurations</h3>
        <div className="space-y-2">
          {siteSettings.map((setting) => (
            <div
              key={setting.id}
              className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded p-3"
            >
              <div>
                <div className="font-semibold text-white text-sm capitalize">{setting.siteKey}</div>
                <div className="text-xs text-slate-500">
                  {setting.username || 'No username'} · Last updated:{' '}
                  {new Date(setting.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <Button
                variant="danger"
                className="px-2 py-1 text-xs"
                onClick={async () => {
                  if (!api) return
                  await api.siteSettings.remove(setting.id)
                  await refreshSiteSettings()
                }}
              >
                Delete
              </Button>
            </div>
          ))}
          {siteSettings.length === 0 && (
            <div className="text-xs text-slate-500">No site settings configured yet.</div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-6">
        <h3 className="font-bold text-white mb-4">How It Works</h3>
        <div className="text-xs text-slate-400 space-y-2">
          <p>
            <strong className="text-cyan-400">1. Save Credentials:</strong> Enter your Askul login
            credentials above and click Save.
          </p>
          <p>
            <strong className="text-cyan-400">2. Create Task:</strong> Go to Tasks tab and add a
            product URL from askul.co.jp.
          </p>
          <p>
            <strong className="text-cyan-400">3. Run Task:</strong> The bot will automatically
            login, check stock, add to cart, and checkout when available.
          </p>
          <p>
            <strong className="text-cyan-400">4. Proxy (Optional):</strong> Add Japan proxies in
            Proxies tab if you&apos;re outside Japan.
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500 selection:text-white overflow-hidden">
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col p-4">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-cyan-500/30">
            A
          </div>
          <h1 className="font-bold text-xl tracking-tight text-white">
            Automation Console <span className="text-xs text-slate-500 font-normal">v1.0</span>
          </h1>
        </div>

        <div className="flex-1">
          <div className="text-xs font-bold text-slate-600 uppercase mb-3 px-2">Core</div>
          <SidebarItem
            icon={LayoutList}
            label="Tasks"
            active={activeTab === 'TASKS'}
            onClick={() => setActiveTab('TASKS')}
          />
          <SidebarItem
            icon={Wifi}
            label="Proxies"
            active={activeTab === 'PROXIES'}
            onClick={() => setActiveTab('PROXIES')}
          />
          <SidebarItem
            icon={User}
            label="Profiles"
            active={activeTab === 'PROFILES'}
            onClick={() => setActiveTab('PROFILES')}
          />
          <SidebarItem
            icon={Settings}
            label="Settings"
            active={activeTab === 'SETTINGS'}
            onClick={() => setActiveTab('SETTINGS')}
          />
          <SidebarItem
            icon={FileText}
            label="Logs"
            active={activeTab === 'LOGS'}
            onClick={() => setActiveTab('LOGS')}
          />
        </div>

        <div className="mt-auto pt-4 border-t border-slate-800">
          <div className="mt-4 bg-slate-800 p-3 rounded-lg flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-400 to-cyan-500"></div>
            <div>
              <div className="text-xs font-bold text-white">Engine Online</div>
              <div className="text-[10px] text-emerald-400">Rate limit active</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/60 backdrop-blur">
          <h2 className="font-bold text-white">
            {activeTab === 'TASKS'
              ? 'Task Manager'
              : activeTab === 'PROXIES'
                ? 'Proxy Manager'
                : activeTab === 'PROFILES'
                  ? 'Profiles'
                  : activeTab === 'SETTINGS'
                    ? 'Site Settings'
                    : 'Engine Logs'}
          </h2>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Service: Online
            </span>
            <span>Concurrency: 4</span>
          </div>
        </header>

        <main className="flex-1 p-6 relative overflow-y-auto h-full">
          {!apiAvailable && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Electron preload API not found. Please run the app via Electron (npm run dev) instead
              of the browser.
            </div>
          )}
          {activeTab === 'TASKS' && renderTasks()}
          {activeTab === 'PROXIES' && renderProxies()}
          {activeTab === 'PROFILES' && renderProfiles()}
          {activeTab === 'SETTINGS' && renderSettings()}
          {activeTab === 'LOGS' && renderLogs()}
        </main>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="Delete"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}

export default App
