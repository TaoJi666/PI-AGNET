import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  Clock3,
  Download,
  Folder,
  Plus,
  Search,
  Workflow,
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2
} from 'lucide-react'
import type {
  ApprovalRequest,
  Idea,
  PublicSettings,
  Schedule,
  LibraryHit,
  LibraryState,
  Session,
  SettingsInput,
  ToolCard
} from '@shared/contract'
import { DEFAULT_HUB_MODEL, HUB_MODELS } from '@shared/hub'
import { BUILT_IN_IDEAS } from '@shared/library'
import type { WorkflowSince } from '@shared/workflows'
import { FilesView } from '@renderer/features/FilesView'
import { SearchView } from '@renderer/features/SearchView'
import { IdeasView } from '@renderer/features/IdeasView'
import { TasksView } from '@renderer/features/TasksView'
import { WorkflowsView } from '@renderer/features/WorkflowsView'
import { MarkdownText } from '@renderer/components/markdown-text'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'

type View = 'chat' | 'workflows' | 'search' | 'ideas' | 'tasks' | 'files' | 'settings'

function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<View>('chat')
  const [draft, setDraft] = useState('')
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [approvalValue, setApprovalValue] = useState('')
  const [workflowId, setWorkflowId] = useState('read-file')
  const [workflowFile, setWorkflowFile] = useState('')
  const [workflowSince, setWorkflowSince] = useState<WorkflowSince>('today')
  const [workflowError, setWorkflowError] = useState('')
  const [workflowRunning, setWorkflowRunning] = useState(false)
  const [library, setLibrary] = useState<LibraryState | null>(null)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryHits, setLibraryHits] = useState<LibraryHit[]>([])
  const [libraryError, setLibraryError] = useState('')
  const [libraryIndexing, setLibraryIndexing] = useState(false)
  const [librarySearching, setLibrarySearching] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const active = sessions.find((session) => session.id === activeId) ?? null
  const visibleSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(query.trim().toLowerCase())
  )
  const groups = useMemo(() => groupSessions(visibleSessions), [visibleSessions])

  useEffect(() => {
    let alive = true
    void window.api.getSnapshot().then((snapshot) => {
      if (!alive) return
      setSessions(snapshot.sessions)
      setIdeas(snapshot.ideas)
      setSchedules(snapshot.schedules)
      setSettings(snapshot.settings)
      setActiveId((current) => current ?? snapshot.sessions[0]?.id ?? null)
    })
    const unsubscribe = window.api.onEvent((event) => {
      if (event.type === 'sessions') setSessions(event.sessions)
      if (event.type === 'schedules') setSchedules(event.schedules)
      if (event.type === 'approval') {
        setApproval(event.request)
        setApprovalValue('')
        setActiveId(event.request.sessionId)
        setView('chat')
      }
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [active?.messages, active?.running, approval?.id])

  useEffect(() => {
    if (view !== 'search') return
    let alive = true
    void window.api.libraryStatus().then(
      (next) => {
        if (alive) setLibrary(next)
      },
      (error: unknown) => {
        if (alive) setLibraryError(error instanceof Error ? error.message : 'Milvus 没有连上')
      }
    )
    return () => {
      alive = false
    }
  }, [view])

  async function createChat(): Promise<string> {
    const session = await window.api.createSession()
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)])
    setActiveId(session.id)
    setView('chat')
    return session.id
  }

  async function removeChat(id: string): Promise<void> {
    const next = await window.api.deleteSession(id)
    setSessions(next)
    if (activeId === id) setActiveId(next[0]?.id ?? null)
  }

  async function submit(text = draft): Promise<void> {
    const content = text.trim()
    if (!content || active?.running) return
    const sessionId = active?.id ?? (await createChat())
    setDraft('')
    setView('chat')
    await window.api.send(sessionId, content)
  }

  async function changeModel(model: string): Promise<void> {
    if (!settings || model === settings.model) return
    const saved = await window.api.saveSettings({
      provider: settings.provider,
      model,
      baseUrl: settings.baseUrl,
      workspace: settings.workspace,
      piPath: settings.piPath
    })
    setSettings(saved)
  }

  async function rename(id: string, title: string): Promise<void> {
    setSessions(await window.api.renameSession(id, title))
  }

  async function exportChat(id: string): Promise<void> {
    await window.api.exportSession(id)
  }

  function openWorkflow(id: string, file?: string): void {
    setWorkflowId(id)
    if (file !== undefined) setWorkflowFile(file)
    setWorkflowError('')
    setView('workflows')
  }

  async function runWorkflow(): Promise<void> {
    setWorkflowRunning(true)
    setWorkflowError('')
    try {
      const session = await window.api.runWorkflow(workflowId, {
        file: workflowFile,
        since: workflowSince
      })
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)])
      setActiveId(session.id)
      setView('chat')
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : '工作流没有运行')
    } finally {
      setWorkflowRunning(false)
    }
  }

  async function indexLibrary(): Promise<void> {
    setLibraryIndexing(true)
    setLibraryError('')
    try {
      setLibrary(await window.api.indexLibrary())
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '索引失败')
    } finally {
      setLibraryIndexing(false)
    }
  }

  async function searchDocuments(): Promise<void> {
    setLibrarySearching(true)
    setLibraryError('')
    try {
      setLibraryHits(await window.api.searchLibrary(libraryQuery))
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '查找失败')
    } finally {
      setLibrarySearching(false)
    }
  }

  async function askLibrary(): Promise<void> {
    setLibrarySearching(true)
    setLibraryError('')
    try {
      const session = await window.api.askLibrary(libraryQuery)
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)])
      setActiveId(session.id)
      setView('chat')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '没有发出提问')
    } finally {
      setLibrarySearching(false)
    }
  }

  async function runTask(id: string): Promise<void> {
    const result = await window.api.runSchedule(id)
    setSchedules(result.schedules)
    setActiveId(result.session.id)
    setView('chat')
  }

  async function answerApproval(confirmed?: boolean, value?: string): Promise<void> {
    if (!approval) return
    await window.api.respondApproval({
      id: approval.id,
      sessionId: approval.sessionId,
      confirmed,
      value,
      cancelled: confirmed === undefined && value === undefined
    })
    setApproval(null)
    setApprovalValue('')
  }

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center px-4">
          <span className="text-sm font-semibold tracking-tight">Pi</span>
        </div>
        <div className="grid gap-2 px-3">
          <Button
            variant="outline"
            className="w-full justify-start bg-background"
            onClick={() => void createChat()}
          >
            <Plus />
            新对话
          </Button>
          <Input
            value={query}
            placeholder="搜索会话"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <nav className="mt-3 grid gap-1 px-3">
          <NavButton
            icon={Workflow}
            label="工作流"
            active={view === 'workflows'}
            onClick={() => setView('workflows')}
          />
          <NavButton
            icon={Search}
            label="检索"
            active={view === 'search'}
            onClick={() => setView('search')}
          />
          <NavButton
            icon={Sparkles}
            label="灵感"
            active={view === 'ideas'}
            onClick={() => setView('ideas')}
          />
          <NavButton
            icon={Clock3}
            label="定时任务"
            active={view === 'tasks'}
            onClick={() => setView('tasks')}
          />
          <NavButton
            icon={Folder}
            label="文件"
            active={view === 'files'}
            onClick={() => setView('files')}
          />
        </nav>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <section key={group.label} className="mb-4">
              <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground">{group.label}</h2>
              <div className="grid gap-0.5">
                {group.items.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      'group flex items-center rounded-md hover:bg-sidebar-accent',
                      view === 'chat' && session.id === activeId && 'bg-sidebar-accent'
                    )}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                      onClick={() => {
                        setActiveId(session.id)
                        setView('chat')
                      }}
                    >
                      <span className="truncate">{session.title}</span>
                      {session.running && (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-1 size-6 opacity-0 group-hover:opacity-100"
                      aria-label="删除会话"
                      onClick={() => void removeChat(session.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="border-t p-3">
          <NavButton
            icon={Settings}
            label="设置"
            active={view === 'settings'}
            onClick={() => setView('settings')}
          />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {view === 'chat' && (
          <ChatView
            session={active}
            settings={settings}
            draft={draft}
            approval={approval}
            approvalValue={approvalValue}
            bottomRef={bottomRef}
            onDraft={setDraft}
            onApprovalValue={setApprovalValue}
            onSubmit={() => void submit()}
            onWorkflow={openWorkflow}
            onAbort={() => active && void window.api.abort(active.id)}
            onApproval={(confirmed, value) => void answerApproval(confirmed, value)}
            onModel={(model) => void changeModel(model)}
            onRename={(title) => active && void rename(active.id, title)}
            onExport={() => active && void exportChat(active.id)}
          />
        )}
        {view === 'search' && (
          <SearchView
            state={library}
            query={libraryQuery}
            hits={libraryHits}
            error={libraryError}
            indexing={libraryIndexing}
            searching={librarySearching}
            onQuery={setLibraryQuery}
            onIndex={() => void indexLibrary()}
            onSearch={() => void searchDocuments()}
            onAsk={() => void askLibrary()}
          />
        )}
        {view === 'ideas' && (
          <IdeasView
            ideas={ideas}
            onChange={setIdeas}
            onUse={(prompt) => void submit(prompt)}
            onOpen={openWorkflow}
          />
        )}
        {view === 'workflows' && (
          <WorkflowsView
            workspace={settings?.workspace ?? ''}
            selectedId={workflowId}
            file={workflowFile}
            since={workflowSince}
            error={workflowError}
            running={workflowRunning}
            onSelect={(id) => {
              setWorkflowId(id)
              setWorkflowError('')
            }}
            onFile={setWorkflowFile}
            onSince={setWorkflowSince}
            onRun={() => void runWorkflow()}
          />
        )}
        {view === 'tasks' && (
          <TasksView
            schedules={schedules}
            onChange={setSchedules}
            onRun={(id) => void runTask(id)}
          />
        )}
        {view === 'files' && (
          <FilesView
            workspace={settings?.workspace ?? ''}
            onRead={(path) => openWorkflow('read-file', path)}
            onInsert={(path) => {
              setDraft((current) => `${current}${current ? '\n' : ''}请看 ${path}`)
              setView('chat')
            }}
          />
        )}
        {view === 'settings' && settings && (
          <SettingsView settings={settings} onSaved={setSettings} />
        )}
      </main>
    </div>
  )
}

function ChatView({
  session,
  settings,
  draft,
  approval,
  approvalValue,
  bottomRef,
  onDraft,
  onApprovalValue,
  onSubmit,
  onWorkflow,
  onAbort,
  onApproval,
  onModel,
  onRename,
  onExport
}: {
  session: Session | null
  settings: PublicSettings | null
  draft: string
  approval: ApprovalRequest | null
  approvalValue: string
  bottomRef: RefObject<HTMLDivElement | null>
  onDraft: (value: string) => void
  onApprovalValue: (value: string) => void
  onSubmit: () => void
  onWorkflow: (id: string) => void
  onAbort: () => void
  onApproval: (confirmed?: boolean, value?: string) => void
  onModel: (model: string) => void
  onRename: (title: string) => void
  onExport: () => void
}): React.JSX.Element {
  const sessionTitle = session?.title ?? ''
  const [title, setTitle] = useState(sessionTitle)
  const [seenTitle, setSeenTitle] = useState(sessionTitle)
  if (sessionTitle !== seenTitle) {
    setSeenTitle(sessionTitle)
    setTitle(sessionTitle)
  }
  const pendingApproval = approval && approval.sessionId === session?.id ? approval : null
  const models = modelOptions(settings?.model)
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
        <Input
          value={title}
          aria-label="会话名称"
          className="h-8 max-w-xs border-transparent bg-transparent shadow-none focus-visible:border-input"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title.trim() && title !== session?.title && onRename(title)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="模型"
            className="h-8 max-w-48 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
            value={settings?.model || DEFAULT_HUB_MODEL}
            onChange={(event) => onModel(event.target.value)}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={!session} onClick={onExport}>
            <Download />
            导出
          </Button>
          <Badge variant="outline">{session?.running ? '工作中' : '空闲'}</Badge>
        </div>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 px-5 py-8">
          {!session || session.messages.length === 0 ? (
            <div className="flex min-h-[46vh] flex-col items-center justify-center text-center">
              <h2 className="text-2xl font-semibold tracking-tight">从一件具体的事开始</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Pi 可以阅读工作区、修改文件并执行命令。调用过程会留在这条对话里。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {BUILT_IN_IDEAS.slice(0, 3).map((idea) => (
                  <Button
                    key={idea.id}
                    variant="outline"
                    size="sm"
                    onClick={() => onWorkflow(idea.id)}
                  >
                    {idea.title}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            session.messages.map((message) =>
              message.role === 'user' ? (
                <div
                  key={message.id}
                  className="ml-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm break-words"
                >
                  {message.text}
                </div>
              ) : (
                <article key={message.id} className="min-w-0 text-sm leading-6">
                  {message.thinking && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      思考 · {message.thinking.slice(0, 80)}
                    </p>
                  )}
                  {message.tools.length > 0 && <ToolStep tools={message.tools} />}
                  {message.text ? (
                    <MarkdownText
                      text={message.text}
                      className={message.error ? 'text-destructive' : undefined}
                    />
                  ) : (
                    session.running &&
                    message.tools.length === 0 && <p className="text-muted-foreground">正在响应…</p>
                  )}
                </article>
              )
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 px-5 pb-5">
        <div className="mx-auto grid w-full max-w-3xl gap-3">
          {pendingApproval && (
            <div className="rounded-xl border bg-card p-3 shadow-xs">
              <p className="text-sm font-medium">{pendingApproval.title}</p>
              {pendingApproval.message && (
                <p className="mt-1 text-sm text-muted-foreground">{pendingApproval.message}</p>
              )}
              {pendingApproval.method === 'input' && (
                <Input
                  className="mt-3"
                  value={approvalValue}
                  placeholder={pendingApproval.placeholder}
                  onChange={(event) => onApprovalValue(event.target.value)}
                />
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingApproval.method === 'select' ? (
                  pendingApproval.options?.map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant="outline"
                      onClick={() => onApproval(undefined, option)}
                    >
                      {option}
                    </Button>
                  ))
                ) : pendingApproval.method === 'input' ? (
                  <Button size="sm" onClick={() => onApproval(undefined, approvalValue)}>
                    提交
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onApproval(true)}>
                    允许
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onApproval()}>
                  取消
                </Button>
              </div>
            </div>
          )}
          <form
            className="rounded-xl border bg-card p-2 shadow-xs"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <Textarea
              value={draft}
              placeholder="描述要完成的任务，Enter 发送，Shift+Enter 换行"
              className="max-h-40 min-h-14 resize-none border-0 shadow-none focus-visible:ring-0"
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  onSubmit()
                }
              }}
            />
            <div className="flex items-center justify-end gap-2 px-1 pb-1">
              {session?.running ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="停止"
                  onClick={onAbort}
                >
                  <Square />
                </Button>
              ) : (
                <Button type="submit" size="icon" aria-label="发送" disabled={!draft.trim()}>
                  <Send />
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

function SettingsView({
  settings,
  onSaved
}: {
  settings: PublicSettings
  onSaved: (settings: PublicSettings) => void
}): React.JSX.Element {
  const [form, setForm] = useState<SettingsInput>({
    provider: settings.provider,
    model: settings.model || DEFAULT_HUB_MODEL,
    baseUrl: settings.baseUrl,
    workspace: settings.workspace,
    piPath: settings.piPath,
    apiKey: ''
  })
  const [notice, setNotice] = useState('')

  function update(patch: Partial<SettingsInput>): void {
    setForm((current) => ({ ...current, ...patch }))
  }

  async function save(): Promise<void> {
    const saved = await window.api.saveSettings(form)
    onSaved(saved)
    setForm((current) => ({ ...current, apiKey: '' }))
    setNotice('已保存。正在运行的 Pi 进程会在下一条消息时重新启动。')
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <form
        className="mx-auto grid w-full max-w-xl gap-6 px-6 py-8"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div>
          <h1 className="text-lg font-semibold tracking-tight">设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">模型、密钥和工作区只保存在本机。</p>
        </div>
        <Field label="接口地址">
          <Input
            value={form.baseUrl}
            placeholder="https://example.com/v1"
            onChange={(event) => update({ baseUrl: event.target.value, provider: 'hub' })}
          />
        </Field>
        <Field label="模型">
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={form.model}
            onChange={(event) => update({ model: event.target.value })}
          >
            {HUB_MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </Field>
        <Field label="API Key">
          <Input
            type="password"
            autoComplete="off"
            value={form.apiKey}
            placeholder={
              settings.hasApiKey ? '已保存，留空则保持不变' : '可选。本机已经 pi 登录时可以不填'
            }
            onChange={(event) => update({ apiKey: event.target.value })}
          />
          {settings.hasApiKey && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 justify-self-start px-0"
              onClick={() => update({ clearApiKey: true, apiKey: '' })}
            >
              清除已保存的密钥
            </Button>
          )}
        </Field>
        <Field label="工作区">
          <div className="flex gap-2">
            <Input
              value={form.workspace}
              onChange={(event) => update({ workspace: event.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void window.api.chooseWorkspace().then((folder) => {
                  if (folder) update({ workspace: folder })
                })
              }}
            >
              选择
            </Button>
          </div>
        </Field>
        <Field label="Pi 可执行文件">
          <Input
            value={form.piPath}
            placeholder="留空使用应用内置的 Pi"
            onChange={(event) => update({ piPath: event.target.value })}
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit">保存</Button>
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  )
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: typeof Settings
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      className={cn(
        'w-full justify-start',
        active && 'bg-sidebar-accent text-sidebar-accent-foreground'
      )}
      onClick={onClick}
    >
      <Icon />
      {label}
    </Button>
  )
}

function ToolStep({ tools }: { tools: ToolCard[] }): React.JSX.Element {
  const running = tools.some((tool) => tool.status === 'running')
  const failed = tools.some((tool) => tool.status === 'error')
  const label = running ? '正在处理' : failed ? '未完成' : '已完成'
  return (
    <details className="mb-3 rounded-lg border bg-card px-3 py-2">
      <summary className={cn('cursor-pointer text-xs font-medium', failed && 'text-destructive')}>
        {label}
      </summary>
      <div className="mt-2 grid gap-2">
        {tools.map((tool) => (
          <div key={tool.id}>
            <p className="text-xs text-muted-foreground">
              {tool.name}
              <span className="ml-2">
                {tool.status === 'running' ? '运行中' : tool.status === 'error' ? '失败' : '完成'}
              </span>
            </p>
            {tool.args && (
              <pre className="mt-1 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                {tool.args}
              </pre>
            )}
            {tool.output && (
              <pre className="mt-1 text-xs break-words whitespace-pre-wrap">{tool.output}</pre>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

function modelOptions(current?: string): string[] {
  const models: string[] = [...HUB_MODELS]
  if (current && !models.includes(current)) models.unshift(current)
  return models
}

function groupSessions(sessions: Session[]): Array<{ label: string; items: Session[] }> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = sessions.filter((session) => session.updatedAt >= start.getTime())
  const earlier = sessions.filter((session) => session.updatedAt < start.getTime())
  return [
    { label: '今天', items: today },
    { label: '更早', items: earlier }
  ].filter((group) => group.items.length > 0)
}

export default App
