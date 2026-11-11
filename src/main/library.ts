import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { MetricType } from '@zilliz/milvus2-sdk-node'
import type { LibraryHit, LibraryState, Session } from '../shared/contract'
import type { AgentHost } from './agent'
import { embed } from './embed'
import { COLLECTION, openMilvus } from './milvus'
import { createSession, publicSettings, renameSession } from './store'

const SKIPPED = new Set(['node_modules', 'dist', 'out', '.git', 'coverage'])
const TEXT = new Set([
  'md',
  'txt',
  'json',
  'js',
  'ts',
  'tsx',
  'jsx',
  'css',
  'html',
  'yml',
  'yaml',
  'vue',
  'py',
  'go',
  'rs',
  'toml'
])

let dbFile = ''

export function setLibraryDb(file: string): void {
  dbFile = file
}

export async function libraryStatus(): Promise<LibraryState> {
  const workspace = workspaceRoot()
  const client = await openMilvus(requiredDb())
  try {
    const queried = await client.query({
      collection_name: COLLECTION,
      filter: `workspace == ${quote(workspace)}`,
      output_fields: ['id'],
      limit: 2000
    })
    return { workspace, chunks: queried.data?.length ?? 0 }
  } catch {
    return { workspace, chunks: 0 }
  }
}

export async function indexWorkspace(): Promise<LibraryState> {
  const workspace = workspaceRoot()
  const rows = collect(workspace)
  const client = await openMilvus(requiredDb())
  try {
    await client.delete({
      collection_name: COLLECTION,
      filter: `workspace == ${quote(workspace)}`
    })
  } catch {
    // 这个工作区还没有旧数据时，删除条件不会命中。
  }
  for (let index = 0; index < rows.length; index += 40) {
    const inserted = await client.insert({
      collection_name: COLLECTION,
      data: rows.slice(index, index + 40)
    })
    if (inserted.status.error_code !== 'Success' || inserted.status.code !== 0) {
      throw new Error(inserted.status.reason || '写入 Milvus 失败')
    }
  }
  return { workspace, chunks: rows.length }
}

export async function searchLibrary(query: string): Promise<LibraryHit[]> {
  const text = query.trim()
  if (!text) return []
  const workspace = workspaceRoot()
  const client = await openMilvus(requiredDb())
  const searched = await client.search({
    collection_name: COLLECTION,
    data: [embed(text)],
    anns_field: 'vector',
    limit: 8,
    filter: `workspace == ${quote(workspace)}`,
    output_fields: ['path', 'text'],
    metric_type: MetricType.COSINE
  })
  return (searched.results ?? [])
    .map((row) => ({
      path: String(row.path ?? ''),
      text: String(row.text ?? ''),
      score: Number(row.score ?? 0)
    }))
    .filter((hit) => hit.path && hit.text)
}

export async function askLibrary(agent: AgentHost, query: string): Promise<Session> {
  const text = query.trim()
  if (!text) throw new Error('请先输入要找的内容')
  const hits = await searchLibrary(text)
  if (hits.length === 0) throw new Error('没有检索到内容。先索引当前工作区。')
  const session = createSession()
  renameSession(session.id, text.slice(0, 24))
  const material = hits.map((hit) => `## ${hit.path}\n\n${hit.text}`).join('\n\n')
  await agent.send(
    session.id,
    text,
    [
      '下面是从本机 Milvus Lite 检索到的工作区片段。',
      '不要读取文件，不要执行命令，只根据这些片段回答。不够就说明缺什么。',
      '',
      material,
      '',
      `问题：${text}`
    ].join('\n')
  )
  return { ...session, title: text.slice(0, 24) }
}

function collect(workspace: string): Array<{
  id: string
  vector: number[]
  path: string
  text: string
  workspace: string
}> {
  const rows: Array<{
    id: string
    vector: number[]
    path: string
    text: string
    workspace: string
  }> = []
  const budget = { seen: 0 }
  walk(workspace, workspace, 0, budget, (file) => {
    if (rows.length >= 800) return
    const info = statSync(file)
    if (info.isDirectory() || info.size > 120_000 || info.size === 0) return
    const path = relative(workspace, file).split(sep).join('/')
    if (path.length > 500 || !isText(path)) return
    const buffer = readFileSync(file)
    if (buffer.subarray(0, 8000).includes(0)) return
    split(buffer.toString('utf8')).forEach((text, index) => {
      if (rows.length >= 800) return
      rows.push({
        id: createHash('sha256').update(`${workspace}\0${path}\0${index}`).digest('hex'),
        vector: embed(text),
        path,
        text,
        workspace
      })
    })
  })
  return rows
}

function split(text: string): string[] {
  const parts: string[] = []
  const size = 480
  for (let index = 0; index < text.length && parts.length < 8; index += 400) {
    const piece = text
      .slice(index, index + size)
      .replace(/\s+/g, ' ')
      .trim()
    if (piece.length > 40) parts.push(piece.slice(0, 1400))
    if (index + size >= text.length) break
  }
  return parts
}

function walk(
  root: string,
  directory: string,
  depth: number,
  budget: { seen: number },
  visit: (file: string) => void
): void {
  if (depth > 4 || budget.seen > 1500) return
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (budget.seen > 1500) return
    if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue
    const full = join(directory, entry.name)
    let resolved: string
    try {
      resolved = realpathSync(full)
    } catch {
      continue
    }
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) continue
    budget.seen += 1
    if (entry.isDirectory()) walk(root, resolved, depth + 1, budget, visit)
    else visit(resolved)
  }
}

function workspaceRoot(): string {
  try {
    return realpathSync(publicSettings().workspace)
  } catch {
    throw new Error('当前工作区不存在')
  }
}

function requiredDb(): string {
  if (!dbFile) throw new Error('Milvus 还没有初始化')
  return dbFile
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function isText(file: string): boolean {
  const extension = file.split('.').pop()?.toLowerCase() ?? ''
  return TEXT.has(extension)
}
