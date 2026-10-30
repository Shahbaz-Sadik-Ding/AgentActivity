import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { CostSegment, UsageEvent } from './types'

export const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects')

const EPS = 1e-9
const dayOf = (iso: string) => iso.slice(0, 10) // timestamps are UTC ISO strings

interface FileState {
  offset: number
  carry: string
  prevModels: Record<string, number> // cumulative per-model cost at the previous snapshot
  days: Set<string> // UTC days of assistant messages since the previous snapshot
  lastDay: string | null
}

const fresh = (): FileState => ({ offset: 0, carry: '', prevModels: {}, days: new Set(), lastDay: null })

/** Incrementally reads Claude Code JSONL logs: exact token usage plus Claude Code's own recorded cost. */
export class ClaudeScanner {
  private files = new Map<string, FileState>()
  private events = new Map<string, UsageEvent>()
  private segments = new Map<string, CostSegment[]>() // by file, so a rewritten file can be re-read cleanly
  /** Latest recorded per-model cost for each session (the last snapshot). */
  private latest = new Map<string, Record<string, number>>()

  constructor(private root = CLAUDE_PROJECTS) {}

  listFiles(): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const f = path.join(dir, e.name)
        if (e.isDirectory()) walk(f)
        else if (e.name.endsWith('.jsonl')) out.push(f)
      }
    }
    walk(this.root)
    return out
  }

  /** Returns true if anything new was read. */
  scan(): boolean {
    let changed = false
    for (const file of this.listFiles()) {
      let size: number
      try {
        size = fs.statSync(file).size
      } catch {
        continue
      }
      let st = this.files.get(file) ?? fresh()
      if (size < st.offset) {
        st = fresh()
        this.segments.delete(file)
      }
      if (size === st.offset) {
        this.files.set(file, st)
        continue
      }
      const fd = fs.openSync(file, 'r')
      try {
        const buf = Buffer.alloc(size - st.offset)
        fs.readSync(fd, buf, 0, buf.length, st.offset)
        const lines = (st.carry + buf.toString('utf8')).split('\n')
        st.carry = lines.pop() ?? '' // partial trailing line, completed on next scan
        st.offset = size
        for (const line of lines) if (this.ingest(line, file, st)) changed = true
      } finally {
        fs.closeSync(fd)
      }
      this.files.set(file, st)
    }
    return changed
  }

  private ingest(line: string, file: string, st: FileState): boolean {
    const isCost = line.includes('"cost-state"')
    if (!isCost && !line.includes('"usage"')) return false
    let j: any
    try {
      j = JSON.parse(line)
    } catch {
      return false
    }
    const isSub = file.includes(`${path.sep}subagents${path.sep}`)

    if (isCost && j.type === 'cost-state' && j.sessionId && !isSub) {
      const cur: Record<string, number> = {}
      for (const [m, u] of Object.entries<any>(j.modelUsage ?? {})) cur[m] = Number(u.costUSD) || 0
      this.latest.set(j.sessionId, cur)
      const byModel: Record<string, number> = {}
      let cost = 0
      for (const m of new Set([...Object.keys(cur), ...Object.keys(st.prevModels)])) {
        const d = (cur[m] ?? 0) - (st.prevModels[m] ?? 0)
        if (Math.abs(d) > EPS) byModel[m] = d
        cost += d
      }
      if (Object.keys(byModel).length) {
        const days = [...st.days].sort()
        const fallback = st.lastDay ?? dayOf(new Date().toISOString())
        const seg: CostSegment = {
          sessionId: j.sessionId,
          from: days[0] ?? fallback,
          to: days[days.length - 1] ?? fallback,
          cost,
          byModel
        }
        const arr = this.segments.get(file) ?? []
        arr.push(seg)
        this.segments.set(file, arr)
      }
      st.prevModels = cur
      st.days = new Set()
      return true
    }

    if (j.type !== 'assistant' || !j.message?.usage || !j.message.id) return false
    const u = j.message.usage
    const rel = path.relative(this.root, file).split(path.sep)
    const agentId = isSub ? path.basename(file, '.jsonl').replace(/^agent-/, '') : null
    const sessionId: string = j.sessionId ?? (isSub ? rel[rel.length - 3] : path.basename(file, '.jsonl'))
    if (typeof j.timestamp === 'string' && !isSub) {
      st.days.add(dayOf(j.timestamp))
      st.lastDay = dayOf(j.timestamp)
    }
    const prev = this.events.get(j.message.id)
    const tools: string[] = (j.message.content ?? [])
      .filter((c: any) => c.type === 'tool_use')
      .map((c: any) => String(c.name))
    // usage is repeated once per content block; the last row holds the final counts (verified on all logged messages)
    this.events.set(j.message.id, {
      id: j.message.id,
      ts: Date.parse(j.timestamp) || prev?.ts || 0,
      sessionId,
      agentId,
      project: j.cwd ?? rel[0],
      model: j.message.model ?? 'unknown',
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      tools: [...new Set([...(prev?.tools ?? []), ...tools])]
    })
    return true
  }

  all(): UsageEvent[] {
    return [...this.events.values()]
  }

  allSegments(): CostSegment[] {
    return [...this.segments.values()].flat()
  }

  /** Claude Code's latest recorded per-model cost for each session. */
  recordedBySession(): Map<string, Record<string, number>> {
    return this.latest
  }
}
