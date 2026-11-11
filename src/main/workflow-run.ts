import type { Session } from '../shared/contract'
import type { WorkflowValues } from '../shared/workflows'
import type { AgentHost } from './agent'
import { createSession, publicSettings, renameSession } from './store'
import { prepareWorkflow } from './workflow-material'

export async function runWorkflow(
  agent: AgentHost,
  id: string,
  values: WorkflowValues
): Promise<Session> {
  const prepared = prepareWorkflow(publicSettings().workspace, id, values)
  const session = createSession()
  renameSession(session.id, prepared.title)
  await agent.send(session.id, prepared.visible, prepared.prompt)
  return { ...session, title: prepared.title }
}
