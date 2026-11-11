import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { findWorkflow, type WorkflowSince, type WorkflowValues } from '../shared/workflows'

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
const ABOUT = ['README.md', 'README', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']

export type PreparedWorkflow = {
  title: string
  visible: string
  prompt: string
}

export function prepareWorkflow(
  workspace: string,
  id: string,
  values: WorkflowValues
): PreparedWorkflow {
  const workflow = findWorkflow(id)
  if (!workflow) throw new Error('没有这个工作流')
  const root = existingRoot(workspace)
  if (id === 'read-file') return prepareRead(root, workflow.title, values.file)
  if (id === 'morning') return prepareMorning(root, workflow.title, values.since ?? 'today')
  if (id === 'boot') return prepareBoot(root, workflow.title)
  if (id === 'changes') return prepareChanges(root, workflow.title, values.since ?? 'today')
  return prepareTodos(root, workflow.title)
}

function prepareRead(root: string, title: string, file: string | undefined): PreparedWorkflow {
  if (!file?.trim()) throw new Error('请先填写文件路径')
  const resolved = resolveInside(root, file)
  if (!resolved) throw new Error('文件不在当前工作区，或文件不存在')
  const info = statSync(resolved)
  if (info.isDirectory()) throw new Error('请选择文件，而不是文件夹')
  const path = toRelative(root, resolved)
  const material = [`文件：${path}`, `大小：${info.size} 字节`, readText(resolved)].join('\n\n')
  return finish(title, `${path}`, material, '先用两三句给结论，再引用关键内容，并写上大致位置。')
}

function prepareMorning(root: string, title: string, since: WorkflowSince): PreparedWorkflow {
  const material = [readAbout(root), collectChanges(root, since)].join('\n\n')
  return finish(
    title,
    sinceLabel(since),
    material,
    '写成三段短早报：这个目录是做什么的、最近有什么变化、今天最值得处理的一件事。'
  )
}

function prepareBoot(root: string, title: string): PreparedWorkflow {
  return finish(
    title,
    '当前工作区',
    readAbout(root),
    '判断现在能不能启动。缺少什么就直接列出，不要假设依赖已经安装成功。'
  )
}

function prepareChanges(root: string, title: string, since: WorkflowSince): PreparedWorkflow {
  return finish(
    title,
    sinceLabel(since),
    collectChanges(root, since),
    '总结做了什么，指出一个可能的风险，并给出下一步最值得验证的一件事。'
  )
}

function prepareTodos(root: string, title: string): PreparedWorkflow {
  return finish(
    title,
    '当前工作区',
    collectTodos(root),
    '按「今天要做」和「可以以后做」分组，每项注明出处文件。'
  )
}

function finish(
  title: string,
  subject: string,
  material: string,
  format: string
): PreparedWorkflow {
  const body = material.length > 32000 ? `${material.slice(0, 32000)}\n\n…（材料已截断）` : material
  return {
    title,
    visible: `运行工作流「${title}」：${subject}`,
    prompt: [
      `你在执行已经固化的工作流「${title}」。`,
      '下面的材料由应用在本机准备。不要读取文件，不要执行命令，只根据材料回答。',
      '',
      body,
      '',
      format
    ].join('\n')
  }
}

function existingRoot(workspace: string): string {
  try {
    return realpathSync(workspace)
  } catch {
    throw new Error('当前工作区不存在')
  }
}

function resolveInside(root: string, target: string): string | undefined {
  try {
    const resolved = realpathSync(resolve(root, target))
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) return undefined
    return resolved
  } catch {
    return undefined
  }
}

function readAbout(root: string): string {
  const parts = ABOUT.map((name) => {
    const resolved = resolveInside(root, name)
    if (!resolved || statSync(resolved).isDirectory()) return ''
    return `## ${name}\n\n${readText(resolved, 8000)}`
  }).filter(Boolean)
  const top = safeEntries(root)
    .map((entry) => entry.name)
    .slice(0, 40)
  return [`顶层条目：${top.join('、 ') || '（空）'}`, ...parts].join('\n\n')
}

function collectChanges(root: string, since: WorkflowSince): string {
  const found: Array<{ path: string; mtime: number; size: number; full: string }> = []
  walk(root, root, 0, (full, info) => {
    if (info.isDirectory() || info.mtimeMs < sinceTime(since)) return
    found.push({ path: toRelative(root, full), mtime: info.mtimeMs, size: info.size, full })
  })
  found.sort((a, b) => b.mtime - a.mtime)
  const picked = found.slice(0, 30)
  if (picked.length === 0) return `最近改动：${sinceLabel(since)}内没有发现文件变化。`
  const lines = picked.map((file) => `- ${file.path}（${file.size} 字节）`)
  const excerpts = picked
    .filter((file) => file.size <= 12_000 && isText(file.path))
    .slice(0, 6)
    .map((file) => `## ${file.path}\n\n${readText(file.full, 2500)}`)
  return [`最近改动（${sinceLabel(since)}，共 ${found.length} 个）：`, ...lines, ...excerpts].join(
    '\n'
  )
}

function collectTodos(root: string): string {
  const hits: string[] = []
  walk(root, root, 0, (full, info) => {
    if (info.isDirectory() || info.size > 150_000 || !isText(full) || hits.length >= 50) return
    const text = readFileSync(full, 'utf8')
    text.split(/\r?\n/).forEach((line, index) => {
      if (hits.length >= 50) return
      if (/^\s*[-*]\s+\[ \]/.test(line) || /\b(TODO|FIXME)\b/.test(line)) {
        hits.push(`- ${toRelative(root, full)}:${index + 1} ${line.trim().slice(0, 180)}`)
      }
    })
  })
  return hits.length > 0 ? hits.join('\n') : '没有找到未完成标记。'
}

function readText(file: string, limit = 24_000): string {
  const size = statSync(file).size
  if (size > 2_000_000) return `文件有 ${size} 字节，超过 2 MB，没有读取内容。`
  const buffer = readFileSync(file)
  if (buffer.subarray(0, 8000).includes(0)) return '这是二进制文件，没有当作文本读取。'
  const text = buffer.toString('utf8')
  if (text.length <= limit) return text
  const head = Math.floor(limit * 0.75)
  return `${text.slice(0, head)}\n\n…（中间已省略）\n\n${text.slice(-(limit - head))}`
}

function walk(
  root: string,
  directory: string,
  depth: number,
  visit: (
    full: string,
    info: { isDirectory: () => boolean; size: number; mtimeMs: number }
  ) => void,
  budget = { seen: 0 }
): void {
  if (depth > 4 || budget.seen > 1500) return
  for (const entry of safeEntries(directory)) {
    if (budget.seen > 1500) return
    if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue
    const full = resolveInside(root, join(directory, entry.name))
    if (!full) continue
    let info
    try {
      info = statSync(full)
    } catch {
      continue
    }
    budget.seen += 1
    visit(full, info)
    if (info.isDirectory()) walk(root, full, depth + 1, visit, budget)
  }
}

function safeEntries(directory: string): Array<{ name: string }> {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function sinceTime(since: WorkflowSince): number {
  if (since === 'week') return Date.now() - 7 * 24 * 60 * 60 * 1000
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

function sinceLabel(since: WorkflowSince): string {
  return since === 'week' ? '近 7 天' : '今天'
}

function isText(file: string): boolean {
  const extension = file.split('.').pop()?.toLowerCase() ?? ''
  return TEXT.has(extension)
}

function toRelative(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}
