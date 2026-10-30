import type { AgentStatus, Tokens } from '../../main/engine/types'

export const fmtN = (n: number): string =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

export const fmtUsd = (n: number | null): string => (n == null ? '—' : '$' + n.toFixed(2))

export const allTok = (t: Tokens): number => t.input + t.output + t.cacheRead + t.cacheWrite

export const fmtDur = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export const fmtTime = (ts: number): string =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export const projName = (p: string): string => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/') || '—'

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: 'Thinking',
  tool: 'Working',
  waiting: 'Needs you',
  idle: 'Idle',
  done: 'Finished',
  ended: 'Ended'
}

export type ToolCat = 'read' | 'write' | 'shell' | 'web' | 'agent' | 'mcp' | 'other'

/** Colour family for a tool name; the CSS variables --c-<cat> carry the actual colours. */
export function toolCat(tool: string): ToolCat {
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return 'read'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'write'
  if (/^(Bash|PowerShell)$/.test(tool)) return 'shell'
  if (/^Web/.test(tool)) return 'web'
  if (/^(Task|Agent|Skill)/.test(tool)) return 'agent'
  if (tool.startsWith('mcp__')) return 'mcp'
  return 'other'
}
