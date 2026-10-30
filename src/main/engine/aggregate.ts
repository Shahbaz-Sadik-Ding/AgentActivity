import type { CostSegment, Summary, Tokens, UsageEvent } from './types'

const zero = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 })
const addTok = (t: Tokens, e: UsageEvent) => {
  t.input += e.input
  t.output += e.output
  t.cacheRead += e.cacheRead
  t.cacheWrite += e.cacheWrite
  t.messages++
}
export const allTokens = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite

const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10) // UTC, like the Claude app

function getOr<K, V>(m: Map<K, V>, k: K, mk: () => V): V {
  let v = m.get(k)
  if (!v) {
    v = mk()
    m.set(k, v)
  }
  return v
}

type SessionAcc = Tokens & { sessionId: string; project: string; start: number; end: number; agents: Set<string> }

/**
 * Everything here is either counted straight from the logs (tokens) or is Claude Code's own recorded
 * cost. Nothing is priced, scaled or estimated; where Claude Code recorded no cost the value is null/absent.
 */
export function summarize(
  events: UsageEvent[],
  segments: CostSegment[],
  recorded: Map<string, Record<string, number>>,
  now = Date.now()
): Summary {
  const todayKey = dayKey(now)
  const monthKey = todayKey.slice(0, 7)
  const cutoff7 = now - 7 * 86_400_000

  const total = zero(), month = zero(), today = zero(), last7 = zero()
  const daily = new Map<string, Tokens & { cost: number }>()
  const byModel = new Map<string, Tokens>()
  const byProject = new Map<string, Tokens>()
  const tools = new Map<string, number>()
  const sessions = new Map<string, SessionAcc>()
  const perAgentTokens: Record<string, number> = {}

  for (const e of events) {
    if (e.model === '<synthetic>') continue
    addTok(total, e)
    const d = dayKey(e.ts)
    if (d.startsWith(monthKey)) addTok(month, e)
    if (d === todayKey) addTok(today, e)
    if (e.ts >= cutoff7) addTok(last7, e)
    addTok(getOr(daily, d, () => ({ ...zero(), cost: 0 })), e)
    addTok(getOr(byModel, e.model, zero), e)
    addTok(getOr(byProject, e.project, zero), e)
    for (const t of e.tools) tools.set(t, (tools.get(t) ?? 0) + 1)
    const s = getOr(sessions, e.sessionId, () => ({
      ...zero(),
      sessionId: e.sessionId,
      project: e.project,
      start: e.ts,
      end: e.ts,
      agents: new Set<string>()
    }))
    addTok(s, e)
    s.start = Math.min(s.start, e.ts)
    s.end = Math.max(s.end, e.ts)
    if (e.agentId) s.agents.add(e.agentId)
    const k = `${e.sessionId}:${e.agentId ?? ''}`
    perAgentTokens[k] = (perAgentTokens[k] ?? 0) + e.input + e.output + e.cacheRead + e.cacheWrite
  }

  // ---- Claude Code's recorded cost
  const sessionCost = new Map<string, number>()
  const modelCost = new Map<string, number>()
  for (const [sid, perModel] of recorded) {
    const sum = Object.values(perModel).reduce((a, b) => a + b, 0)
    sessionCost.set(sid, sum)
    for (const [m, c] of Object.entries(perModel)) modelCost.set(m, (modelCost.get(m) ?? 0) + c)
  }
  const projectCost = new Map<string, number>()
  for (const s of sessions.values()) {
    const c = sessionCost.get(s.sessionId)
    if (c !== undefined) projectCost.set(s.project, (projectCost.get(s.project) ?? 0) + c)
  }

  let monthCost = 0, straddling = 0, unallocated = 0
  for (const seg of segments) {
    if (seg.from === seg.to) {
      const row = daily.get(seg.from)
      if (row) row.cost += seg.cost
      else daily.set(seg.from, { ...zero(), cost: seg.cost })
    }
    const inMonth = seg.from.startsWith(monthKey) && seg.to.startsWith(monthKey)
    const touches = seg.from.startsWith(monthKey) || seg.to.startsWith(monthKey)
    if (inMonth) {
      monthCost += seg.cost
      if (seg.from !== seg.to) unallocated += seg.cost
    } else if (touches) straddling += seg.cost
  }

  // A model can have recorded cost yet no logged messages; keep its dollars visible.
  for (const m of modelCost.keys()) if (!byModel.has(m)) byModel.set(m, zero())

  const withCost = [...sessions.values()].filter((s) => sessionCost.has(s.sessionId))
  const withoutCost = [...sessions.values()].filter((s) => !sessionCost.has(s.sessionId))
  const byCostDesc = <T extends { cost: number | null; output: number }>(a: T, b: T) =>
    (b.cost ?? -1) - (a.cost ?? -1) || b.output - a.output

  return {
    generatedAt: now,
    recorded: {
      total: [...sessionCost.values()].reduce((a, b) => a + b, 0),
      month: monthCost,
      monthStraddling: straddling,
      unallocated,
      sessionsWithCost: withCost.length,
      sessionsWithoutCost: withoutCost.length,
      tokensWithoutCost: withoutCost.reduce((a, s) => a + allTokens(s), 0)
    },
    tokens: { total, month, today, last7Days: last7 },
    daily: [...daily].map(([date, t]) => ({ date, ...t })).sort((a, b) => a.date.localeCompare(b.date)),
    byModel: [...byModel]
      .map(([model, t]) => ({ model, cost: modelCost.get(model) ?? null, ...t }))
      .sort(byCostDesc),
    byProject: [...byProject]
      .map(([project, t]) => ({ project, cost: projectCost.get(project) ?? null, ...t }))
      .sort(byCostDesc),
    byTool: [...tools].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
    sessions: [...sessions.values()]
      .map(({ agents, ...s }) => ({ ...s, subagents: agents.size, cost: sessionCost.get(s.sessionId) ?? null }))
      .sort((a, b) => b.end - a.end),
    perAgentTokens
  }
}
