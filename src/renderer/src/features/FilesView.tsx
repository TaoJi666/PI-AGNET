import { useEffect, useState } from 'react'
import type { WorkspaceFile } from '@shared/contract'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

export function FilesView({
  workspace,
  onRead,
  onInsert
}: {
  workspace: string
  onRead: (relativePath: string) => void
  onInsert: (relativePath: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<WorkspaceFile[]>([])

  useEffect(() => {
    let alive = true
    void window.api.listFiles(query).then((next) => {
      if (alive) setFiles(next)
    })
    return () => {
      alive = false
    }
  }, [query, workspace])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-6 py-5">
        <h1 className="text-lg font-semibold tracking-tight">文件</h1>
        <p className="mt-1 truncate text-sm text-muted-foreground">{workspace}</p>
        <Input
          className="mt-4 max-w-md"
          value={query}
          placeholder="按文件名筛选"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
        {files.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">这个工作区里没有可显示的文件。</p>
        ) : (
          <div className="grid gap-1">
            {files.map((file) => (
              <div
                key={file.relativePath}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{file.relativePath}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.directory ? '文件夹' : formatSize(file.size)}
                  </p>
                </div>
                {!file.directory && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => onRead(file.relativePath)}>
                      阅读
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onInsert(file.relativePath)}>
                      引用
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
