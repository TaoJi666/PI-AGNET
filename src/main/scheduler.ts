import type { Schedule, Session } from '../shared/contract'
import type { AgentHost } from './agent'
import {
  createSession,
  dueSchedules,
  getSchedule,
  listSchedules,
  markSchedule,
  renameSession
} from './store'

export async function runSchedule(agent: AgentHost, id: string): Promise<Session | undefined> {
  const schedule = getSchedule(id)
  if (!schedule) return undefined
  const session = await launch(agent, schedule)
  markSchedule(id, today(), `${clock().time} 已发送`)
  return session
}

export function startScheduler(
  agent: AgentHost,
  onChange: (schedules: Schedule[]) => void
): () => void {
  const timer = setInterval(() => {
    void runDue(agent, onChange)
  }, 20000)
  return () => clearInterval(timer)
}

async function runDue(agent: AgentHost, onChange: (schedules: Schedule[]) => void): Promise<void> {
  const current = clock()
  const due = dueSchedules(current.day, current.time)
  if (due.length === 0) return
  for (const schedule of due) {
    markSchedule(schedule.id, current.day, `${current.time} 已发送`)
    await launch(agent, schedule)
  }
  onChange(listSchedules())
}

async function launch(agent: AgentHost, schedule: Schedule): Promise<Session> {
  const session = createSession()
  renameSession(session.id, schedule.title)
  await agent.send(session.id, schedule.prompt)
  return { ...session, title: schedule.title }
}

function clock(date = new Date()): { day: string; time: string } {
  return { day: today(date), time: formatTime(date) }
}

function today(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
