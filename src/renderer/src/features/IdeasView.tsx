import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Idea } from '@shared/contract'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'

export function IdeasView({
  ideas,
  onChange,
  onUse,
  onOpen
}: {
  ideas: Idea[]
  onChange: (ideas: Idea[]) => void
  onUse: (prompt: string) => void
  onOpen: (id: string) => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')

  async function create(): Promise<void> {
    const next = await window.api.createIdea(title, prompt)
    onChange(next)
    setTitle('')
    setPrompt('')
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">灵感</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            内置条目会打开对应工作流。自己保存的仍直接交给 Pi。
          </p>
        </div>
        <div className="grid gap-3">
          {ideas.map((idea) => (
            <article key={idea.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">{idea.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{idea.summary}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => (idea.builtIn ? onOpen(idea.id) : onUse(idea.prompt))}
                  >
                    {idea.builtIn ? '打开' : '开始'}
                  </Button>
                  {!idea.builtIn && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="删除灵感"
                      onClick={() => void window.api.deleteIdea(idea.id).then(onChange)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        <form
          className="grid gap-3 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <h2 className="text-sm font-medium">保存一条自己的灵感</h2>
          <Input
            value={title}
            placeholder="名称，例如 周报草稿"
            onChange={(event) => setTitle(event.target.value)}
          />
          <Textarea
            value={prompt}
            placeholder="交给 Pi 的完整任务"
            onChange={(event) => setPrompt(event.target.value)}
          />
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!title.trim() || !prompt.trim()}
          >
            保存
          </Button>
        </form>
      </div>
    </div>
  )
}
