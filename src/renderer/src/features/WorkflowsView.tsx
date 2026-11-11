import { findWorkflow, WORKFLOWS, type WorkflowSince } from '@shared/workflows'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

export function WorkflowsView({
  workspace,
  selectedId,
  file,
  since,
  error,
  running,
  onSelect,
  onFile,
  onSince,
  onRun
}: {
  workspace: string
  selectedId: string
  file: string
  since: WorkflowSince
  error: string
  running: boolean
  onSelect: (id: string) => void
  onFile: (file: string) => void
  onSince: (since: WorkflowSince) => void
  onRun: () => void
}): React.JSX.Element {
  const selected = findWorkflow(selectedId) ?? WORKFLOWS[0]
  const needsFile = selected.widgets.includes('file')
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">工作流</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            读取和扫描在本机完成。Pi 只做最后一步总结，结果进一条新对话。
          </p>
        </div>
        <div className="grid gap-2">
          {WORKFLOWS.map((workflow) => (
            <button
              key={workflow.id}
              className={cn(
                'rounded-xl border px-4 py-3 text-left',
                workflow.id === selected.id && 'border-primary'
              )}
              onClick={() => onSelect(workflow.id)}
            >
              <span className="text-sm font-medium">{workflow.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{workflow.summary}</span>
            </button>
          ))}
        </div>
        <div>
          <ol>
            {selected.nodes.map((node, index) => (
              <li key={node.id}>
                {index > 0 && <div className="ml-5 h-4 border-l" />}
                <div className="rounded-xl border bg-card px-4 py-3">
                  <p className="text-sm font-medium">{node.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{node.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-3">
            <p className="truncate text-xs text-muted-foreground">当前工作区：{workspace}</p>
            {needsFile && (
              <Input
                value={file}
                placeholder="工作区内的相对路径"
                onChange={(event) => onFile(event.target.value)}
              />
            )}
            {selected.widgets.includes('since') && (
              <select
                aria-label="时间范围"
                className="h-9 max-w-40 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                value={since}
                onChange={(event) => onSince(event.target.value === 'week' ? 'week' : 'today')}
              >
                <option value="today">今天</option>
                <option value="week">近 7 天</option>
              </select>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="justify-self-start"
              disabled={running || (needsFile && !file.trim())}
              onClick={onRun}
            >
              {running ? '正在运行' : '运行'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
