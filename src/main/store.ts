import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type {
  Idea,
  PublicSettings,
  Schedule,
  ScheduleInput,
  Session,
  SettingsInput
} from '../shared/contract'
import { BUILT_IN_IDEAS } from '../shared/library'

type StoredSettings = {
  provider: string
  model: string
  baseUrl: string
  workspace: string
  piPath: string
  apiKeySeal?: string
}

type Persisted = {
  sessions: Session[]
  settings: StoredSettings
  ideas: Idea[]
  schedules: Schedule[]
}

let filePath = ''
let saveTimer: NodeJS.Timeout | undefined
let state: Persisted = {
  sessions: [],
  settings: { provider: '', model: '', baseUrl: '', workspace: '', piPath: '' },
  ideas: [],
  schedules: []
}

export function initStore(userData: string, workspace: string): void {
  mkdirSync(userData, { recursive: true })
  filePath = join(userData, 'desktop-state.json')
  state = readState(workspace)
  state.sessions.forEach((session) => {
    session.running = false
  })
  flushStore()
}

export function listSessions(): Session[] {
  return state.sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => structuredClone(session))
}

export function publicSettings(): PublicSettings {
  return {
    provider: state.settings.provider,
    model: state.settings.model,
    baseUrl: state.settings.baseUrl,
    workspace: state.settings.workspace,
    piPath: state.settings.piPath,
    hasApiKey: Boolean(state.settings.apiKeySeal)
  }
}

export function readApiKey(): string | undefined {
  if (!state.settings.apiKeySeal) return undefined
  try {
    const sealed = Buffer.from(state.settings.apiKeySeal, 'base64')
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(sealed)
    return sealed.toString('utf8')
  } catch {
    return undefined
  }
}

export function saveSettings(input: SettingsInput): PublicSettings {
  state.settings.baseUrl = input.baseUrl.trim()
  state.settings.provider = state.settings.baseUrl ? 'hub' : input.provider.trim()
  state.settings.model = input.model.trim()
  state.settings.workspace = input.workspace.trim()
  state.settings.piPath = input.piPath.trim()
  if (input.clearApiKey) {
    delete state.settings.apiKeySeal
  } else if (input.apiKey?.trim()) {
    const raw = input.apiKey.trim()
    const sealed = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(raw)
      : Buffer.from(raw, 'utf8')
    state.settings.apiKeySeal = sealed.toString('base64')
  }
  mkdirSync(state.settings.workspace, { recursive: true })
  flushStore()
  return publicSettings()
}

export function createSession(): Session {
  const now = Date.now()
  const session: Session = {
    id: randomUUID(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    running: false,
    messages: []
  }
  state.sessions.unshift(session)
  flushStore()
  return structuredClone(session)
}

export function listIdeas(): Idea[] {
  return [
    ...BUILT_IN_IDEAS.map((idea) => ({ ...idea, builtIn: true })),
    ...state.ideas.map((idea) => structuredClone(idea))
  ]
}

export function createIdea(title: string, prompt: string): Idea[] {
  const name = title.trim()
  const text = prompt.trim()
  if (!name || !text) return listIdeas()
  state.ideas.unshift({
    id: randomUUID(),
    title: name.slice(0, 24),
    summary: text.slice(0, 42),
    prompt: text,
    builtIn: false
  })
  flushStore()
  return listIdeas()
}

export function deleteIdea(id: string): Idea[] {
  state.ideas = state.ideas.filter((idea) => idea.id !== id)
  flushStore()
  return listIdeas()
}

export function listSchedules(): Schedule[] {
  return state.schedules.map((item) => structuredClone(item))
}

export function saveSchedule(input: ScheduleInput): Schedule[] {
  const title = input.title.trim()
  const prompt = input.prompt.trim()
  const time = normalizeTime(input.time)
  if (!title || !prompt || !time) return listSchedules()
  state.schedules.unshift({
    id: randomUUID(),
    title: title.slice(0, 24),
    prompt,
    time,
    enabled: true,
    lastMessage: '尚未运行'
  })
  flushStore()
  return listSchedules()
}

export function setScheduleEnabled(id: string, enabled: boolean): Schedule[] {
  const schedule = state.schedules.find((item) => item.id === id)
  if (!schedule) return listSchedules()
  schedule.enabled = enabled
  flushStore()
  return listSchedules()
}

export function deleteSchedule(id: string): Schedule[] {
  state.schedules = state.schedules.filter((item) => item.id !== id)
  flushStore()
  return listSchedules()
}

export function dueSchedules(day: string, time: string): Schedule[] {
  return state.schedules
    .filter((item) => item.enabled && item.time === time && item.lastRunOn !== day)
    .map((item) => structuredClone(item))
}

export function markSchedule(id: string, day: string, message: string): Schedule[] {
  const schedule = state.schedules.find((item) => item.id === id)
  if (!schedule) return listSchedules()
  schedule.lastRunOn = day
  schedule.lastMessage = message
  flushStore()
  return listSchedules()
}

export function getSchedule(id: string): Schedule | undefined {
  const schedule = state.schedules.find((item) => item.id === id)
  return schedule ? structuredClone(schedule) : undefined
}

export function renameSession(id: string, title: string): Session[] {
  changeSession(id, (session) => {
    session.title = title.trim().slice(0, 40) || '新对话'
  })
  flushStore()
  return listSessions()
}

export function removeSession(id: string): void {
  state.sessions = state.sessions.filter((session) => session.id !== id)
  flushStore()
}

export function changeSession(id: string, change: (session: Session) => void): Session | undefined {
  const session = state.sessions.find((item) => item.id === id)
  if (!session) return undefined
  change(session)
  session.updatedAt = Date.now()
  scheduleSave()
  return structuredClone(session)
}

export function flushStore(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  if (!filePath) return
  writeFileSync(filePath, JSON.stringify(state))
}

function readState(workspace: string): Persisted {
  const fallback: Persisted = {
    sessions: [],
    settings: { provider: '', model: '', baseUrl: '', workspace, piPath: '' },
    ideas: [],
    schedules: []
  }
  if (!existsSync(filePath)) return fallback
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Persisted>
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas.filter((idea) => !idea.builtIn) : [],
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
      settings: {
        provider: parsed.settings?.provider ?? '',
        model: parsed.settings?.model ?? '',
        baseUrl: parsed.settings?.baseUrl ?? '',
        workspace: parsed.settings?.workspace || workspace,
        piPath: parsed.settings?.piPath ?? '',
        apiKeySeal: parsed.settings?.apiKeySeal
      }
    }
  } catch {
    return fallback
  }
}

function normalizeTime(value: string): string | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return `${match[1]}:${match[2]}`
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    writeFileSync(filePath, JSON.stringify(state))
  }, 200)
}
