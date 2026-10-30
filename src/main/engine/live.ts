import path from 'node:path'
import type { ActivityItem, AgentStatus, LiveAgent, LiveSnapshot } from './types'

const MAX_RECENT = 12
const STALE_WORKING_MS = 10 * 60_000 // working with no events this long -> assume idle
const FORGET_MS = 60 * 60_000 // drop agents silent for an hour

const clip = (s: unknown, n: number): string => {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** One-line description of what a tool call is doing. */
export function describeTool(tool: string, input: any): string {
  if (!input || typeof input !== 'object') return ''
  const file = input.file_path ?? input.path ?? input.notebook_path
  if (typeof file === 'string') return path.basename(file) + (input.pattern ? ` · ${clip(input.pattern, 40)}` : '')
  if (typeof input.command === 'string') return clip(input.description ?? input.command, 110)
  if (typeof input.pattern === 'string') return clip(input.pattern, 80)
  if (typeof input.url === 'string') return clip(input.url, 100)
  if (typeof input.query === 'string') return clip(input.query, 100)
  if (typeof input.description === 'string') return clip(input.description, 100)
  if (typeof input.skill === 'string') return clip(input.skill, 60)
  const first = Object.values(input).find((v) => typeof v === 'string')
  return clip(first, 100)
}

export class LiveTracker {
  private agents = new Map<string, LiveAgent>()
  private received = 0
  private last: number | null = null
  private usage: (sessionId: string, agentId: string | null) => number = () => 0

  setUsageLookup(fn: (sessionId: string, agentId: string | null) => number): void {
    this.usage = fn
  }

  private ensure(sessionId: string, agentId: string | null, now: number, cwd?: string, agentType?: string | null): LiveAgent {
    const key = agentId ? `${sessionId}:${agentId}` : sessionId
    let a = this.agents.get(key)
    if (!a) {
      a = {
        key,
        sessionId,
        agentId,
        agentType: agentType ?? (agentId ? 'subagent' : null),
        project: cwd ?? '',
        status: 'idle',
        currentTool: null,
        currentDetail: '',
        toolStartedAt: null,
        startedAt: now,
        lastEventAt: now,
        toolCount: 0,
        prompt: '',
        lastMessage: '',
        recent: [],
        tokens: 0
      }
      this.agents.set(key, a)
    }
    if (cwd && !a.project) a.project = cwd
    if (agentType) a.agentType = agentType
    a.lastEventAt = now
    return a
  }

  private setStatus(a: LiveAgent, s: AgentStatus): void {
    a.status = s
    if (s !== 'tool') {
      a.currentTool = null
      a.currentDetail = ''
      a.toolStartedAt = null
    }
  }

  /** Apply one Claude Code hook payload. */
  handle(ev: any, now = Date.now()): void {
    if (!ev || typeof ev !== 'object' || typeof ev.hook_event_name !== 'string' || typeof ev.session_id !== 'string') return
    this.received++
    this.last = now
    const name: string = ev.hook_event_name
    const agentId: string | null = typeof ev.agent_id === 'string' && ev.agent_id ? ev.agent_id : null
    // Claude Code also fires a lone SubagentStop (empty agent_type, no start, no tool calls) for its own
    // internal helpers, e.g. the "suggested next prompt" generator. Those are not real subagents.
    if (name === 'SubagentStop' && agentId && !this.agents.has(`${ev.session_id}:${agentId}`)) return
    const a = this.ensure(ev.session_id, agentId, now, ev.cwd, ev.agent_type)

    switch (name) {
      case 'SessionStart':
        this.setStatus(a, 'idle')
        break
      case 'UserPromptSubmit':
        a.prompt = clip(ev.prompt, 140)
        this.setStatus(a, 'working')
        break
      case 'PreToolUse':
        a.status = 'tool'
        a.currentTool = String(ev.tool_name ?? 'tool')
        a.currentDetail = describeTool(a.currentTool, ev.tool_input)
        a.toolStartedAt = now
        break
      case 'PostToolUse':
      case 'PostToolUseFailure': {
        const started = a.toolStartedAt
        const item: ActivityItem = {
          ts: now,
          tool: String(ev.tool_name ?? a.currentTool ?? 'tool'),
          detail: describeTool(String(ev.tool_name ?? ''), ev.tool_input) || a.currentDetail,
          ok: name === 'PostToolUse',
          ms: started ? now - started : null
        }
        a.recent.unshift(item)
        if (a.recent.length > MAX_RECENT) a.recent.length = MAX_RECENT
        a.toolCount++
        this.setStatus(a, 'working')
        break
      }
      case 'PermissionRequest':
        a.status = 'waiting'
        a.currentTool = String(ev.tool_name ?? 'permission')
        a.currentDetail = 'Waiting for your permission: ' + describeTool(a.currentTool, ev.tool_input)
        a.toolStartedAt = now
        break
      case 'Notification':
        if (ev.notification_type === 'permission_prompt' || /permission/i.test(String(ev.message ?? ''))) {
          a.status = 'waiting'
          a.currentTool = null
          a.currentDetail = clip(ev.message, 140) || 'Waiting for your permission'
          a.toolStartedAt = now
        } else if (ev.notification_type === 'idle_prompt') {
          this.setStatus(a, 'idle')
        }
        break
      case 'SubagentStart':
        // Payload carries the subagent's own agent_id; ensure() already created it.
        a.agentType = typeof ev.agent_type === 'string' ? ev.agent_type : a.agentType
        this.setStatus(a, 'working')
        break
      case 'SubagentStop':
        a.lastMessage = clip(ev.last_assistant_message, 200)
        this.setStatus(a, 'done')
        break
      case 'Stop':
        a.lastMessage = clip(ev.last_assistant_message, 200)
        this.setStatus(a, 'idle')
        // subagents can keep running after the main agent stops; their own SubagentStop ends them
        break
      case 'SessionEnd':
        for (const o of this.agents.values()) if (o.sessionId === a.sessionId) this.setStatus(o, 'ended')
        break
      default:
        break
    }
  }

  snapshot(now = Date.now()): LiveSnapshot {
    for (const [k, a] of this.agents) {
      if (now - a.lastEventAt > FORGET_MS) {
        this.agents.delete(k)
        continue
      }
      if ((a.status === 'working' || a.status === 'tool') && now - a.lastEventAt > STALE_WORKING_MS) this.setStatus(a, 'idle')
      a.tokens = this.usage(a.sessionId, a.agentId)
    }
    const order: Record<AgentStatus, number> = { waiting: 0, tool: 1, working: 2, idle: 3, done: 4, ended: 5 }
    const agents = [...this.agents.values()].sort(
      (x, y) => order[x.status] - order[y.status] || y.lastEventAt - x.lastEventAt
    )
    return { agents: structuredClone(agents), eventsReceived: this.received, lastEventAt: this.last }
  }
}
