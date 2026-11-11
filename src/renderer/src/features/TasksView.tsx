import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Schedule, ScheduleInput } from '@shared/contract'
import { MORNING_TASK } from '@shared/library'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'

export function TasksView({
  schedules,
  onChange,
  onRun
}: {
  schedules: Schedule[]
  onChange: (schedules: Schedule[]) => void
  onRun: (id: string) => void
}): React.JSX.Element {
  const [form, setForm] = useState<ScheduleInput>({
    title: '',
    prompt: '',
    time: '09:00'
  })

  async function save(): Promise<void> {
    onChange(await window.api.saveSchedule(form))
    setForm({ title: '', prompt: '', time: '09:00' })
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">定时任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            应用保持打开时，到点会新开一条对话并交给 Pi。错过的时间不会补跑。
          </p>
        </div>
        <div className="grid gap-3">
          {schedules.length === 0 && (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              还没有定时任务。可以用早报模板先试一次。
            </div>
          )}
          {schedules.map((schedule) => (
            <article key={schedule.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">
                    {schedule.time} · {schedule.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {schedule.prompt}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {schedule.enabled ? '已启用' : '已暂停'} · {schedule.lastMessage ?? '尚未运行'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => onRun(schedule.id)}>
                    现在运行
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void window.api
                        .setScheduleEnabled(schedule.id, !schedule.enabled)
                        .then(onChange)
                    }
                  >
                    {schedule.enabled ? '暂停' : '启用'}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="删除任务"
                    onClick={() => void window.api.deleteSchedule(schedule.id).then(onChange)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
        <form
          className="grid gap-3 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">新建任务</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setForm({
                  title: MORNING_TASK.title,
                  prompt: MORNING_TASK.prompt,
                  time: MORNING_TASK.time,
                  workflowId: MORNING_TASK.workflowId
                })
              }
            >
              使用早报模板
            </Button>
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-2">
            <Input
              type="time"
              value={form.time}
              onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
            />
            <Input
              value={form.title}
              placeholder="任务名称"
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <Textarea
            value={form.prompt}
            placeholder="到点后交给 Pi 的任务"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                prompt: event.target.value,
                workflowId: undefined
              }))
            }
          />
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!form.title.trim() || !form.prompt.trim()}
          >
            保存任务
          </Button>
        </form>
      </div>
    </div>
  )
}
