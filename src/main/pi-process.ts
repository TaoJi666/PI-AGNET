import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ApprovalRequest, ApprovalResponse } from '../shared/contract'
import { DEFAULT_HUB_MODEL, HUB_MODELS, HUB_PROVIDER } from '../shared/hub'

export type PiNotice =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool-start'; id: string; name: string; args: unknown }
  | { type: 'tool-end'; id: string; name: string; output: unknown; isError: boolean }
  | { type: 'settled'; aborted: boolean }
  | { type: 'error'; message: string }
  | { type: 'session-file'; path: string }
  | { type: 'approval'; request: Omit<ApprovalRequest, 'sessionId'> }

type RpcResponse = {
  id?: string
  type: string
  command?: string
  success?: boolean
  error?: string
  data?: { disposition?: string; sessionFile?: string }
}

type Waiter = {
  resolve: (response: RpcResponse) => void
  reject: (error: Error) => void
}

const PROVIDER_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY'
}

export function resolvePiCommand(customPath: string): { command: string; prefix: string[] } {
  const custom = customPath.trim()
  if (custom && !custom.endsWith('.js')) return { command: custom, prefix: [] }
  const cli =
    custom ||
    [
      join(app.getAppPath(), 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'),
      join(
        process.resourcesPath,
        'app.asar.unpacked/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'
      )
    ].find((candidate) => existsSync(candidate))
  if (!cli) return { command: 'pi', prefix: [] }
  return { command: process.execPath, prefix: [cli] }
}

export class PiProcess {
  private child?: ChildProcessWithoutNullStreams
  private buffer = Buffer.alloc(0)
  private waiters = new Map<string, Waiter>()
  private ready = false
  private active = false
  private lastStderr = ''
  private closed = false

  constructor(private readonly onNotice: (notice: PiNotice) => void) {}

  async start(options: {
    sessionId: string
    sessionDir: string
    sessionPath?: string
    workspace: string
    provider: string
    model: string
    baseUrl: string
    piPath: string
    apiKey?: string
  }): Promise<void> {
    if (this.child) return
    const resolved = resolvePiCommand(options.piPath)
    const args = [
      ...resolved.prefix,
      '--mode',
      'rpc',
      '--session-dir',
      options.sessionDir,
      '--approve',
      '--append-system-prompt',
      '你在 Pi Desktop 中工作。用中文回答。先给结论，再说明实际读过、改过或执行过的内容。'
    ]
    if (options.sessionPath && existsSync(options.sessionPath)) {
      args.push('--session', options.sessionPath)
    } else {
      args.push('--session-id', options.sessionId)
    }
    const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    if (options.baseUrl) {
      const configDir = join(app.getPath('userData'), 'pi-config')
      writeHubModels(configDir, options.baseUrl)
      env.PI_CODING_AGENT_DIR = configDir
      if (options.apiKey) env.PI_DESKTOP_API_KEY = options.apiKey
      args.push('--provider', HUB_PROVIDER, '--model', options.model || DEFAULT_HUB_MODEL)
    } else {
      if (options.provider) args.push('--provider', options.provider)
      if (options.model) args.push('--model', options.model)
      const envName = PROVIDER_ENV[options.provider]
      if (envName && options.apiKey) env[envName] = options.apiKey
    }

    const child = spawn(resolved.command, args, {
      cwd: options.workspace,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child

    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => {
        if (!this.ready) reject(error)
      }
      child.once('spawn', () => {
        this.ready = true
        resolve()
      })
      child.once('error', (error) => {
        const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
        fail(new Error(missing ? '没有找到 Pi。可以在设置中填写可执行文件路径。' : error.message))
      })
      child.once('exit', (code) => {
        fail(new Error(this.lastStderr || `Pi 启动后立即退出（${code ?? 'unknown'}）`))
      })
    })

    child.stdout.on('data', (chunk: Buffer) => this.consume(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      this.lastStderr = chunk.toString('utf8').trim().slice(-700)
    })
    child.on('exit', () => {
      this.closed = true
      this.rejectWaiters(new Error(this.lastStderr || 'Pi 进程已退出'))
      if (this.active) {
        this.active = false
        this.onNotice({ type: 'error', message: this.lastStderr || 'Pi 进程已退出' })
      }
    })
  }

  async prompt(message: string): Promise<void> {
    this.active = true
    try {
      const response = await this.request({ type: 'prompt', message })
      if (!response.success) throw new Error(response.error || 'Pi 没有接受这条消息')
      if (response.data?.disposition === 'handled') {
        this.active = false
        this.onNotice({ type: 'settled', aborted: false })
      }
    } catch (error) {
      this.active = false
      throw error
    }
  }

  abort(): void {
    if (!this.child || this.closed) return
    this.write({ type: 'abort' })
  }

  respond(response: ApprovalResponse): void {
    const payload: Record<string, unknown> = {
      type: 'extension_ui_response',
      id: response.id
    }
    if (response.cancelled) payload.cancelled = true
    else if (typeof response.confirmed === 'boolean') payload.confirmed = response.confirmed
    else payload.value = response.value ?? ''
    this.write(payload)
  }

  requestState(): void {
    if (!this.child || this.closed) return
    this.write({ id: randomUUID(), type: 'get_state' })
  }

  stop(): void {
    this.closed = true
    this.child?.stdin.end()
    this.child?.kill()
  }

  private request(command: Record<string, unknown>): Promise<RpcResponse> {
    if (!this.child || this.closed) return Promise.reject(new Error('Pi 没有在运行'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { resolve, reject })
      this.write({ ...command, id })
    })
  }

  private write(command: Record<string, unknown>): void {
    this.child?.stdin.write(`${JSON.stringify(command)}\n`)
  }

  private consume(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    let newline = this.buffer.indexOf(0x0a)
    while (newline >= 0) {
      const line = this.buffer.subarray(0, newline).toString('utf8').replace(/\r$/, '')
      this.buffer = this.buffer.subarray(newline + 1)
      if (line.trim()) this.handleLine(line)
      newline = this.buffer.indexOf(0x0a)
    }
  }

  private handleLine(line: string): void {
    let record: Record<string, unknown>
    try {
      record = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    if (record.type === 'response' && typeof record.id === 'string') {
      const waiter = this.waiters.get(record.id)
      if (waiter) {
        this.waiters.delete(record.id)
        waiter.resolve(record as RpcResponse)
      }
      const data = record.data as { sessionFile?: string } | undefined
      if (record.command === 'get_state' && record.success && data?.sessionFile) {
        this.onNotice({ type: 'session-file', path: data.sessionFile })
      }
      return
    }
    this.route(record)
  }

  private route(record: Record<string, unknown>): void {
    if (record.type === 'message_update') {
      const event = record.assistantMessageEvent as { type?: string; delta?: string } | undefined
      if (event?.type === 'text_delta' && event.delta)
        this.onNotice({ type: 'text', delta: event.delta })
      if (event?.type === 'thinking_delta' && event.delta) {
        this.onNotice({ type: 'thinking', delta: event.delta })
      }
      if (event?.type === 'error') {
        const error = event as { error?: { errorMessage?: string } | string }
        const message = typeof error.error === 'string' ? error.error : error.error?.errorMessage
        if (message) this.onNotice({ type: 'error', message })
      }
      return
    }
    if (record.type === 'tool_execution_start') {
      this.onNotice({
        type: 'tool-start',
        id: String(record.toolCallId ?? randomUUID()),
        name: String(record.toolName ?? '工具'),
        args: record.args
      })
      return
    }
    if (record.type === 'tool_execution_end') {
      this.onNotice({
        type: 'tool-end',
        id: String(record.toolCallId ?? ''),
        name: String(record.toolName ?? '工具'),
        output: record.result,
        isError: Boolean(record.isError)
      })
      return
    }
    if (record.type === 'agent_settled') {
      this.active = false
      this.onNotice({ type: 'settled', aborted: Boolean(record.aborted) })
      return
    }
    if (record.type === 'extension_ui_request') this.routeApproval(record)
  }

  private routeApproval(record: Record<string, unknown>): void {
    const method = record.method
    const id = String(record.id ?? '')
    if (method !== 'confirm' && method !== 'select' && method !== 'input') {
      this.write({ type: 'extension_ui_response', id, cancelled: true })
      return
    }
    this.onNotice({
      type: 'approval',
      request: {
        id,
        method,
        title: String(record.title ?? '需要确认'),
        message: typeof record.message === 'string' ? record.message : undefined,
        options: Array.isArray(record.options) ? record.options.map(String) : undefined,
        placeholder: typeof record.placeholder === 'string' ? record.placeholder : undefined
      }
    })
  }

  private rejectWaiters(error: Error): void {
    this.waiters.forEach((waiter) => waiter.reject(error))
    this.waiters.clear()
  }
}

function writeHubModels(dir: string, baseUrl: string): void {
  mkdirSync(dir, { recursive: true })
  const models = HUB_MODELS.map((id) => ({
    id,
    name: id,
    input: id.includes('vl') ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192
  }))
  writeFileSync(
    join(dir, 'models.json'),
    JSON.stringify(
      {
        providers: {
          [HUB_PROVIDER]: {
            name: 'API Hub',
            baseUrl,
            api: 'openai-completions',
            apiKey: '$PI_DESKTOP_API_KEY',
            authHeader: true,
            models
          }
        }
      },
      null,
      2
    )
  )
}
