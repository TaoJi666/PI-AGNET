import type { WorkflowValues } from './workflows'

export type ToolCard = {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  args: string
  output: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking: string
  tools: ToolCard[]
  createdAt: number
  error: boolean
}

export type Session = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  running: boolean
  piSessionPath?: string
  messages: ChatMessage[]
}

export type PublicSettings = {
  provider: string
  model: string
  baseUrl: string
  workspace: string
  piPath: string
  hasApiKey: boolean
}

export type SettingsInput = {
  provider: string
  model: string
  baseUrl: string
  workspace: string
  piPath: string
  apiKey?: string
  clearApiKey?: boolean
}

export type ApprovalRequest = {
  id: string
  sessionId: string
  method: 'confirm' | 'select' | 'input'
  title: string
  message?: string
  options?: string[]
  placeholder?: string
}

export type ApprovalResponse = {
  id: string
  sessionId: string
  confirmed?: boolean
  value?: string
  cancelled?: boolean
}

export type Idea = {
  id: string
  title: string
  summary: string
  prompt: string
  builtIn: boolean
}

export type Schedule = {
  id: string
  title: string
  prompt: string
  time: string
  enabled: boolean
  workflowId?: string
  lastRunOn?: string
  lastMessage?: string
}

export type ScheduleInput = {
  title: string
  prompt: string
  time: string
  workflowId?: string
}

export type WorkspaceFile = {
  name: string
  relativePath: string
  directory: boolean
  size: number
}

export type AppEvent =
  | { type: 'sessions'; sessions: Session[] }
  | { type: 'approval'; request: ApprovalRequest }
  | { type: 'schedules'; schedules: Schedule[] }

export type Snapshot = {
  sessions: Session[]
  settings: PublicSettings
  ideas: Idea[]
  schedules: Schedule[]
}

export type DesktopApi = {
  getSnapshot: () => Promise<Snapshot>
  createSession: () => Promise<Session>
  deleteSession: (id: string) => Promise<Session[]>
  renameSession: (id: string, title: string) => Promise<Session[]>
  exportSession: (id: string) => Promise<string | null>
  send: (sessionId: string, text: string) => Promise<void>
  abort: (sessionId: string) => Promise<void>
  saveSettings: (input: SettingsInput) => Promise<PublicSettings>
  chooseWorkspace: () => Promise<string | null>
  respondApproval: (response: ApprovalResponse) => Promise<void>
  createIdea: (title: string, prompt: string) => Promise<Idea[]>
  deleteIdea: (id: string) => Promise<Idea[]>
  saveSchedule: (input: ScheduleInput) => Promise<Schedule[]>
  setScheduleEnabled: (id: string, enabled: boolean) => Promise<Schedule[]>
  deleteSchedule: (id: string) => Promise<Schedule[]>
  runSchedule: (id: string) => Promise<{ session: Session; schedules: Schedule[] }>
  runWorkflow: (id: string, values: WorkflowValues) => Promise<Session>
  listFiles: (query: string) => Promise<WorkspaceFile[]>
  onEvent: (handler: (event: AppEvent) => void) => () => void
}
