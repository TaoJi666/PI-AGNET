import type { LibraryHit, LibraryState } from '@shared/contract'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

export function SearchView({
  state,
  query,
  hits,
  error,
  indexing,
  searching,
  onQuery,
  onIndex,
  onSearch,
  onAsk
}: {
  state: LibraryState | null
  query: string
  hits: LibraryHit[]
  error: string
  indexing: boolean
  searching: boolean
  onQuery: (query: string) => void
  onIndex: () => void
  onSearch: () => void
  onAsk: () => void
}): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">检索</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            把工作区片段写入本机 Milvus Lite。查找时按词和汉字的相似度匹配，文件不会上传。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={indexing} onClick={onIndex}>
            {indexing ? '正在索引' : '索引当前工作区'}
          </Button>
          <p className="text-sm text-muted-foreground">
            {state ? `已索引 ${state.chunks} 段` : '还没有连接 Milvus'}
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSearch()
          }}
        >
          <Input
            value={query}
            placeholder="例如 项目怎么启动"
            onChange={(event) => onQuery(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={searching || !query.trim()}>
            {searching ? '查找中' : '查找'}
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-2">
          {hits.map((hit) => (
            <article
              key={`${hit.path}-${hit.text.slice(0, 24)}`}
              className="rounded-xl border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="truncate text-sm font-medium">{hit.path}</h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {Math.round(hit.score * 100)}
                </span>
              </div>
              <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">
                {hit.text}
              </p>
            </article>
          ))}
        </div>
        {hits.length > 0 && (
          <Button className="justify-self-start" disabled={searching} onClick={onAsk}>
            就这些结果提问
          </Button>
        )}
      </div>
    </div>
  )
}
