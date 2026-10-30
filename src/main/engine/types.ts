export interface UsageEvent {
  id: string // message id (dedupe key)
  ts: number // epoch ms
  sessionId: string
  agentId: string | null // set for subagent logs
  project: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  tools: string[]
}

/**
 * Cost Claude Code recorded between two of its own `cost-state` snapshots in a session log.
 * Snapshots are cumulative, so the delta is exactly what Claude Code says that interval cost.
 * from/to are the UTC days of the messages inside the interval.
 */
export interface CostSegment {
  sessionId: string
  from: string
  to: string
  cost: number
  byModel: Record<string, number>
}

export interface Tokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  messages: number
}

export type AgentStatus = 'working' | 'tool' | 'waiting' | 'idle' | 'done' | 'ended'

export interface ActivityItem {
  ts: number
  tool: string
  detail: string
  ok: boolean
  ms: number | null
}

export interface LiveAgent {
  key: string
  sessionId: string
  agentId: string | null
  agentType: string | null
  project: string
  status: AgentStatus
  currentTool: string | null
  currentDetail: string
  toolStartedAt: number | null
  startedAt: number
  lastEventAt: number
  toolCount: number
  prompt: string
  lastMessage: string
  recent: ActivityItem[]
  tokens: number // exact, from the agent's own log
}

export interface LiveSnapshot {
  agents: LiveAgent[]
  eventsReceived: number
  lastEventAt: number | null
}

export interface HooksStatus {
  installed: boolean
  events: string[]
  settingsPath: string
  port: number
  serverListening: boolean
  error: string | null
}

export interface Summary {
  generatedAt: number
  /** Claude Code's recorded cost (its own client-side figure, not the Anthropic bill). */
  recorded: {
    total: number // sum of each session's latest snapshot
    month: number // intervals lying entirely inside the current UTC month
    monthStraddling: number // intervals crossing a month boundary: not counted in `month`
    unallocated: number // multi-day intervals inside the month (counted in `month`, not in daily bars)
    sessionsWithCost: number
    sessionsWithoutCost: number
    tokensWithoutCost: number // all-token count of sessions that have no recorded cost
  }
  tokens: { total: Tokens; month: Tokens; today: Tokens; last7Days: Tokens }
  /** cost = recorded intervals that fall entirely on this one UTC day */
  daily: Array<{ date: string; cost: number } & Tokens>
  byModel: Array<{ model: string; cost: number | null } & Tokens>
  byProject: Array<{ project: string; cost: number | null } & Tokens>
  byTool: Array<{ tool: string; count: number }>
  sessions: Array<
    {
      sessionId: string
      project: string
      start: number
      end: number
      subagents: number
      cost: number | null // null = Claude Code recorded no cost for this session
    } & Tokens
  >
  /** keyed `${sessionId}:${agentId ?? ''}` */
  perAgentTokens: Record<string, number>
}
