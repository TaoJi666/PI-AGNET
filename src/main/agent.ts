import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { BrowserWindow } from 'electron'
import type { AppEvent, ApprovalResponse, ChatMessage, ToolCard } from '../shared/contract'
import { PiProcess, type PiNotice } from './pi-process'
import * as store from './store'

export { flushStore } from './store'

export class AgentHost {
  private processes = new Map<string, PiProcess>()
  private emitTimer: NodeJS.Timeout | undefined
  private sessionDir = ''

  constructor(private readonly window: () => BrowserWindow | null) {}

  setSessionDir(dir: string): void {
    mkdirSync(dir, { recursive: true })
    this.sessionDir = dir
  }

  async send(sessionId: string, text: string): Promise<void> {
    const content = text.trim()
    if (!content) return
    const current = store.listSessions().find((session) => session.id === sessionId)
    if (!current || current.running) return
    const placeholder: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      text: '',
      thinking: '',
      tools: [],
      createdAt: Date.now(),
      error: false
    }
    store.changeSession(sessionId, (session) => {
      session.messages.push({
        id: randomUUID(),
        role: 'user',
        text: content,
        thinking: '',
        tools: [],
        createdAt: Date.now(),
        error: false
      })
      if (session.title === '新对话') session.title = content.slice(0, 24)
      session.messages.push(placeholder)
      session.running = true
    })
    this.publish(true)

    try {
      const process = await this.processFor(sessionId)
      await process.prompt(content)
    } catch (error) {
      this.fail(sessionId, error instanceof Error ? error.message : 'Pi 启动失败')
    }
  }

  abort(sessionId: string): void {
    this.processes.get(sessionId)?.abort()
  }

  respond(response: ApprovalResponse): void {
    this.processes.get(response.sessionId)?.respond(response)
  }

  closeSession(sessionId: string): void {
    this.processes.get(sessionId)?.stop()
    this.processes.delete(sessionId)
  }

  stopAll(): void {
    this.processes.forEach((process) => process.stop())
    this.processes.clear()
  }

  private async processFor(sessionId: string): Promise<PiProcess> {
    const existing = this.processes.get(sessionId)
    if (existing) return existing
    const settings = store.publicSettings()
    const session = store.listSessions().find((item) => item.id === sessionId)
    const process = new PiProcess((notice) => this.onNotice(sessionId, notice))
    await process.start({
      sessionId,
      sessionDir: this.sessionDir,
      sessionPath: session?.piSessionPath,
      workspace: settings.workspace,
      provider: settings.provider,
      model: settings.model,
      baseUrl: settings.baseUrl,
      piPath: settings.piPath,
      apiKey: store.readApiKey()
    })
    this.processes.set(sessionId, process)
    return process
  }

  private onNotice(sessionId: string, notice: PiNotice): void {
    if (notice.type === 'approval') {
      this.emit({ type: 'approval', request: { ...notice.request, sessionId } })
      return
    }
    if (notice.type === 'session-file') {
      store.changeSession(sessionId, (session) => {
        session.piSessionPath = notice.path
      })
      return
    }
    store.changeSession(sessionId, (session) => {
      const message = lastAssistant(session.messages)
      if (!message) return
      if (notice.type === 'text') message.text += notice.delta
      if (notice.type === 'thinking') message.thinking += notice.delta
      if (notice.type === 'tool-start') message.tools.push(toolCard(notice))
      if (notice.type === 'tool-end') finishTool(message.tools, notice)
      if (notice.type === 'error') {
        message.error = true
        message.text = message.text || notice.message
        session.running = false
      }
      if (notice.type === 'settled') {
        session.running = false
        if (!message.text && message.tools.length === 0) message.text = '这次没有产生可见回复。'
      }
    })
    const force = notice.type === 'settled' || notice.type === 'error'
    this.publish(force)
    if (notice.type === 'settled') this.processes.get(sessionId)?.requestState()
  }

  private fail(sessionId: string, message: string): void {
    store.changeSession(sessionId, (session) => {
      const assistant = lastAssistant(session.messages)
      if (assistant) {
        assistant.error = true
        assistant.text = message
      }
      session.running = false
    })
    this.publish(true)
    this.closeSession(sessionId)
  }

  private publish(immediate = false): void {
    if (immediate) {
      if (this.emitTimer) clearTimeout(this.emitTimer)
      this.emitTimer = undefined
      this.emit({ type: 'sessions', sessions: store.listSessions() })
      return
    }
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined
      this.emit({ type: 'sessions', sessions: store.listSessions() })
    }, 40)
  }

  private emit(event: AppEvent): void {
    this.window()?.webContents.send('app:event', event)
  }
}

function lastAssistant(messages: ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return messages[index]
  }
  return undefined
}

function toolCard(notice: Extract<PiNotice, { type: 'tool-start' }>): ToolCard {
  return {
    id: notice.id,
    name: notice.name,
    status: 'running',
    args: brief(notice.args),
    output: ''
  }
}

function finishTool(tools: ToolCard[], notice: Extract<PiNotice, { type: 'tool-end' }>): void {
  const tool = tools.find((item) => item.id === notice.id) ?? tools[tools.length - 1]
  if (!tool) return
  tool.status = notice.isError ? 'error' : 'done'
  tool.output = brief(notice.output)
}

function brief(value: unknown): string {
  try {
    const text = typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? '')
    return text.length > 1600 ? `${text.slice(0, 1600)}\n…` : text
  } catch {
    return ''
  }
}
