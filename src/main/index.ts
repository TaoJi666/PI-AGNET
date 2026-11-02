import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { ApprovalResponse, ScheduleInput, Session, SettingsInput } from '../shared/contract'
import { AgentHost } from './agent'
import { listWorkspaceFiles } from './files'
import { runSchedule, startScheduler } from './scheduler'
import {
  createIdea,
  createSession,
  deleteIdea,
  deleteSchedule,
  flushStore,
  initStore,
  listIdeas,
  listSchedules,
  listSessions,
  publicSettings,
  removeSession,
  renameSession,
  saveSchedule,
  saveSettings,
  setScheduleEnabled
} from './store'

let mainWindow: BrowserWindow | null = null
let host: AgentHost | null = null
let stopScheduler: (() => void) | undefined

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Pi',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
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

function registerIpc(agent: AgentHost): void {
  ipcMain.handle('desktop:snapshot', () => ({
    sessions: listSessions(),
    settings: publicSettings(),
    ideas: listIdeas(),
    schedules: listSchedules()
  }))
  ipcMain.handle('session:create', () => createSession())
  ipcMain.handle('session:delete', (_event, id: unknown) => {
    agent.closeSession(String(id))
    removeSession(String(id))
    return listSessions()
  })
  ipcMain.handle('session:rename', (_event, id: unknown, title: unknown) =>
    renameSession(String(id), String(title ?? ''))
  )
  ipcMain.handle('session:export', (_event, id: unknown) => exportSession(String(id)))
  ipcMain.handle('idea:create', (_event, title: unknown, prompt: unknown) =>
    createIdea(String(title ?? ''), String(prompt ?? ''))
  )
  ipcMain.handle('idea:delete', (_event, id: unknown) => deleteIdea(String(id)))
  ipcMain.handle('schedule:save', (_event, input: unknown) =>
    saveSchedule(normalizeSchedule(input))
  )
  ipcMain.handle('schedule:enabled', (_event, id: unknown, enabled: unknown) =>
    setScheduleEnabled(String(id), Boolean(enabled))
  )
  ipcMain.handle('schedule:delete', (_event, id: unknown) => deleteSchedule(String(id)))
  ipcMain.handle('schedule:run', async (_event, id: unknown) => {
    const session = await runSchedule(agent, String(id))
    if (!session) throw new Error('任务不存在')
    return { session, schedules: listSchedules() }
  })
  ipcMain.handle('files:list', (_event, query: unknown) => listWorkspaceFiles(String(query ?? '')))
  ipcMain.handle('chat:send', (_event, sessionId: unknown, text: unknown) =>
    agent.send(String(sessionId), String(text ?? ''))
  )
  ipcMain.handle('chat:abort', (_event, sessionId: unknown) => agent.abort(String(sessionId)))
  ipcMain.handle('settings:save', (_event, input: unknown) => {
    const next = normalizeSettings(input)
    if (!next.workspace) throw new Error('工作区不能为空')
    const saved = saveSettings(next)
    agent.stopAll()
    return saved
  })
  ipcMain.handle('workspace:choose', async () => {
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory']
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('approval:respond', (_event, response: unknown) => {
    agent.respond(normalizeApproval(response))
  })
}

function normalizeSchedule(value: unknown): ScheduleInput {
  const input = (value ?? {}) as Partial<ScheduleInput>
  return {
    title: String(input.title ?? ''),
    prompt: String(input.prompt ?? ''),
    time: String(input.time ?? '')
  }
}

async function exportSession(id: string): Promise<string | null> {
  const session = listSessions().find((item) => item.id === id)
  if (!session) return null
  const options: Electron.SaveDialogOptions = {
    defaultPath: `${session.title}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  writeFileSync(result.filePath, renderSession(session))
  return result.filePath
}

function renderSession(session: Session): string {
  const lines = [`# ${session.title}`, '']
  for (const message of session.messages) {
    lines.push(message.role === 'user' ? '## 你' : '## Pi', '', message.text || '（没有文本）', '')
    for (const tool of message.tools) {
      lines.push(`### ${tool.name}`, '', tool.output || tool.args || '（没有输出）', '')
    }
  }
  return lines.join('\n')
}

function normalizeSettings(value: unknown): SettingsInput {
  const input = (value ?? {}) as Partial<SettingsInput>
  return {
    provider: String(input.provider ?? ''),
    model: String(input.model ?? ''),
    baseUrl: String(input.baseUrl ?? '').trim(),
    workspace: String(input.workspace ?? '').trim(),
    piPath: String(input.piPath ?? ''),
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : undefined,
    clearApiKey: Boolean(input.clearApiKey)
  }
}

function normalizeApproval(value: unknown): ApprovalResponse {
  const input = (value ?? {}) as Partial<ApprovalResponse>
  return {
    id: String(input.id ?? ''),
    sessionId: String(input.sessionId ?? ''),
    confirmed: typeof input.confirmed === 'boolean' ? input.confirmed : undefined,
    value: typeof input.value === 'string' ? input.value : undefined,
    cancelled: Boolean(input.cancelled)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.taoji.pi')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const workspace = join(app.getPath('documents'), 'Pi')
  mkdirSync(workspace, { recursive: true })
  initStore(app.getPath('userData'), workspace)
  mkdirSync(publicSettings().workspace, { recursive: true })

  host = new AgentHost(() => mainWindow)
  host.setSessionDir(join(app.getPath('userData'), 'pi-sessions'))
  registerIpc(host)
  stopScheduler = startScheduler(host, (schedules) => {
    mainWindow?.webContents.send('app:event', { type: 'schedules', schedules })
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopScheduler?.()
  host?.stopAll()
  flushStore()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
