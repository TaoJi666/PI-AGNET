import { readdirSync, realpathSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { WorkspaceFile } from '../shared/contract'
import { publicSettings } from './store'

const SKIPPED = new Set(['node_modules', 'dist', 'out', '.git'])

export function listWorkspaceFiles(query: string): WorkspaceFile[] {
  const workspace = publicSettings().workspace
  let root: string
  try {
    root = realpathSync(workspace)
  } catch {
    return []
  }
  const files: WorkspaceFile[] = []
  walk(root, root, 0, files)
  const needle = query.trim().toLowerCase()
  return files
    .filter((file) => !needle || file.relativePath.toLowerCase().includes(needle))
    .slice(0, 200)
}

function walk(root: string, directory: string, depth: number, files: WorkspaceFile[]): void {
  if (depth > 2 || files.length >= 200) return
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue
    const fullPath = join(directory, entry.name)
    const resolved = safePath(root, fullPath)
    if (!resolved) continue
    const info = safeStat(resolved)
    if (!info) continue
    files.push({
      name: entry.name,
      relativePath: relative(root, resolved).split(sep).join('/'),
      directory: info.isDirectory(),
      size: info.isDirectory() ? 0 : info.size
    })
    if (info.isDirectory()) walk(root, resolved, depth + 1, files)
  }
}

function safePath(root: string, target: string): string | undefined {
  try {
    const resolved = realpathSync(target)
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) return undefined
    return resolved
  } catch {
    return undefined
  }
}

function safeStat(target: string): { isDirectory: () => boolean; size: number } | undefined {
  try {
    return statSync(target)
  } catch {
    return undefined
  }
}
