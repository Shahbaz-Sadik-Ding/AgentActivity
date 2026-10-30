import { memo, useMemo } from 'react'
import type { HooksStatus, LiveAgent, LiveSnapshot } from '../../main/engine/types'
import { STATUS_LABEL, fmtDur, fmtN, projName, toolCat } from './util'

const isBusy = (a: LiveAgent) => a.status === 'tool' || a.status === 'working'
const FEED_PER_AGENT = 5 // tool calls shown per agent in the activity stream
const FEED_AGENTS = 8 // agents shown there, most recently active first
const RECENT_DONE = 3 // finished subagents kept visible per session; older ones fold away
const isLive =(a: LiveAgent) => a.status !== 'ended' && a.status !== 'done'

/** Status orb. Only transform/opacity are animated, so it stays on the compositor. */
function Orb({ a, small }: { a: LiveAgent; small?: boolean }) {
  const glyph = a.agentId ? (a.agentType ?? 'S').slice(0, 1).toUpperCase() : '✦'
  return (
    <span className={`orb o-${a.status}${small ? ' sm' : ''}`} aria-hidden>
      <i className="ring" />
      <i className="core">{a.status === 'done' ? '✓' : glyph}</i>
      {a.status === 'tool' && (
        <i className="sat">
          <b />
        </i>
      )}
    </span>
  )
}

/** Last tool calls as a tiny tape: one tick per call, coloured by kind, newest on the right. */
function Tape({ a }: { a: LiveAgent }) {
  if (a.recent.length === 0) return <span className="tape empty" />
  const items = [...a.recent].slice(0, 14).reverse()
  return (
    <span className="tape" aria-label="recent tool calls">
      {items.map((r, i) => (
        <i
          key={r.ts + ':' + i}
          className={`tick c-${toolCat(r.tool)}${r.ok ? '' : ' fail'}`}
          style={{ opacity: 0.35 + (0.65 * (i + 1)) / items.length }}
          title={`${r.tool} · ${r.detail}${r.ms != null ? ' · ' + fmtDur(r.ms) : ''}`}
        />
      ))}
    </span>
  )
}

const AgentLine = memo(function AgentLine({ a, now, main }: { a: LiveAgent; now: number; main: boolean }) {
  const cat = a.currentTool ? toolCat(a.currentTool) : 'other'
  return (
    <div className={`line s-${a.status}${main ? ' main' : ' sub-agent'}`}>
      <Orb a={a} small={!main} />
      <div className="line-body">
        <div className="line-head">
          <strong>{main ? 'Main agent' : (a.agentType ?? 'Subagent')}</strong>
          <span className={`badge b-${a.status}`}>{STATUS_LABEL[a.status]}</span>
          <span className="spacer" />
          <span className="faint">
            {a.tokens > 0 ? `${fmtN(a.tokens)} tok · ` : ''}
            {a.toolCount} calls · {fmtDur(now - a.startedAt)}
          </span>
        </div>

        {a.status === 'tool' && a.currentTool && (
          <div className="action">
            <span className={`pill c-${cat}`}>{a.currentTool}</span>
            <span className="detail">{a.currentDetail}</span>
            {a.toolStartedAt && <span className="faint mono">{fmtDur(now - a.toolStartedAt)}</span>}
          </div>
        )}
        {a.status === 'waiting' && (
          <div className="action wait">
            <span className="detail">{a.currentDetail || 'Waiting for your permission'}</span>
            {a.toolStartedAt && <span className="faint mono">{fmtDur(now - a.toolStartedAt)}</span>}
          </div>
        )}
        {a.status === 'working' && (
          <div className="action quiet">
            <span className="detail">{a.prompt ? `“${a.prompt}”` : 'Thinking…'}</span>
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {(a.status === 'idle' || a.status === 'done') && a.lastMessage && (
          <div className="action quiet">
            <span className="detail">{a.lastMessage}</span>
          </div>
        )}
        <Tape a={a} />
      </div>
    </div>
  )
})

interface Group {
  sessionId: string
  project: string
  main: LiveAgent | null
  subs: LiveAgent[]
  lastEventAt: number
}

function group(agents: LiveAgent[]): Group[] {
  const m = new Map<string, Group>()
  for (const a of agents) {
    const g = m.get(a.sessionId) ?? { sessionId: a.sessionId, project: a.project, main: null, subs: [], lastEventAt: 0 }
    if (a.agentId) g.subs.push(a)
    else g.main = a
    if (!g.project) g.project = a.project
    g.lastEventAt = Math.max(g.lastEventAt, a.lastEventAt)
    m.set(a.sessionId, g)
  }
  // Needs-you first, then actively working, then calm; most recent first within each.
  const rank = (g: Group) => {
    const all = [...(g.main ? [g.main] : []), ...g.subs]
    return all.some((a) => a.status === 'waiting') ? 0 : all.some(isBusy) ? 1 : 2
  }
  return [...m.values()].sort((x, y) => rank(x) - rank(y) || y.lastEventAt - x.lastEventAt)
}

function SessionCard({ g, now }: { g: Group; now: number }) {
  const all = [...(g.main ? [g.main] : []), ...g.subs]
  const needs = all.some((a) => a.status === 'waiting')
  const busy = all.some(isBusy)
  const state = needs ? 'needs' : busy ? 'busy' : 'calm'
  const activeSubs = g.subs.filter(isLive)
  const finishedAll = g.subs.filter((a) => !isLive(a)).sort((x, y) => y.lastEventAt - x.lastEventAt)
  const recentDone = finishedAll.slice(0, RECENT_DONE)
  const finishedSubs = finishedAll.slice(RECENT_DONE)
  const shown = [...activeSubs.sort((x, y) => y.lastEventAt - x.lastEventAt), ...recentDone]
  return (
    <article className={`card session st-${state}`}>
      <header className="session-head">
        <h3>{projName(g.project)}</h3>
        <span className="faint">{g.sessionId.slice(0, 8)}</span>
        <span className="spacer" />
        {activeSubs.length > 0 && <span className="chip">{activeSubs.length} subagent{activeSubs.length > 1 ? 's' : ''}</span>}
      </header>
      {g.main && <AgentLine a={g.main} now={now} main />}
      {shown.length > 0 && (
        <div className="tree">
          {shown
            .map((a) => (
              <div key={a.key} className={`branch${isBusy(a) ? ' flowing' : ''}`}>
                <span className="wire">
                  <i />
                </span>
                <AgentLine a={a} now={now} main={false} />
              </div>
            ))}
        </div>
      )}
      {finishedSubs.length > 0 && (
        <details className="finished-subs">
          <summary>{finishedSubs.length} older finished subagent{finishedSubs.length > 1 ? 's' : ''}</summary>
          <div className="tree">
            {finishedSubs.map((a) => (
              <div key={a.key} className="branch">
                <span className="wire">
                  <i />
                </span>
                <AgentLine a={a} now={now} main={false} />
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  )
}

function Feed({ agents, now }: { agents: LiveAgent[]; now: number }) {
  const groups = useMemo(() => {
    type Row = { k: string; ts: number; tool: string; detail: string; running: boolean; ok: boolean }
    const out: Array<{ key: string; who: string; project: string; last: number; rows: Row[] }> = []
    for (const a of agents) {
      const rows: Row[] = []
      if (a.status === 'tool' && a.currentTool && a.toolStartedAt)
        rows.push({ k: a.key + ':run', ts: a.toolStartedAt, tool: a.currentTool, detail: a.currentDetail, running: true, ok: true })
      a.recent.slice(0, FEED_PER_AGENT).forEach((r, i) =>
        rows.push({ k: `${a.key}:${r.ts}:${i}`, ts: r.ts, tool: r.tool, detail: r.detail, running: false, ok: r.ok })
      )
      if (rows.length === 0) continue
      rows.sort((x, y) => y.ts - x.ts)
      out.push({
        key: a.key,
        who: a.agentId ? (a.agentType ?? 'Subagent') : 'Main agent',
        project: projName(a.project),
        last: rows[0].ts,
        rows: rows.slice(0, FEED_PER_AGENT)
      })
    }
    return out.sort((x, y) => y.last - x.last).slice(0, FEED_AGENTS)
  }, [agents])

  return (
    <aside className="card feed">
      <h2>Activity stream</h2>
      {groups.length === 0 && <div className="faint pad">Tool calls will stream in here.</div>}
      {groups.map((g) => (
        <section key={g.key} className="feed-group">
          <h4>
            <b>{g.who}</b>
            <span className="faint">{g.project}</span>
          </h4>
          <ul>
            {g.rows.map((r) => (
              <li key={r.k} className={`${r.running ? 'running' : ''}${r.ok ? '' : ' fail'}`}>
                <span className={`pill c-${toolCat(r.tool)}`}>{r.tool}</span>
                <span className="detail" title={r.detail}>{r.detail || '—'}</span>
                <span className="faint mono">{r.running ? 'now' : fmtDur(now - r.ts) + ' ago'}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  )
}

export function AgentsView({
  live,
  hooks,
  now,
  busy,
  onInstall,
  onUninstall
}: {
  live: LiveSnapshot | null
  hooks: HooksStatus | null
  now: number
  busy: boolean
  onInstall: () => void
  onUninstall: () => void
}) {
  const agents = live?.agents ?? []
  const groups = useMemo(() => group(agents), [agents])
  const current = groups.filter((g) => [...(g.main ? [g.main] : []), ...g.subs].some(isLive))
  const earlier = groups.filter((g) => !current.includes(g))
  const liveAgents = agents.filter(isLive)
  const needs = liveAgents.filter((a) => a.status === 'waiting').length
  const working = liveAgents.filter(isBusy).length
  const subs = liveAgents.filter((a) => a.agentId && (isBusy(a) || a.status === 'waiting')).length

  return (
    <section className="view">
      <div className="kpis">
        <div className="kpi"><b>{liveAgents.length}</b><span>active agents</span></div>
        <div className="kpi"><b>{working}</b><span>working now</span></div>
        <div className={`kpi${needs ? ' alert' : ''}`}><b>{needs}</b><span>need you</span></div>
        <div className="kpi"><b>{subs}</b><span>subagents</span></div>
        <div className="kpi-meta">
          <span className="faint small">
            {live?.lastEventAt ? `last event ${fmtDur(now - live.lastEventAt)} ago · ${live.eventsReceived} received` : 'no events yet'}
          </span>
          {hooks?.installed && (
            <button className="btn ghost" disabled={busy} onClick={onUninstall}>Disable tracking</button>
          )}
        </div>
      </div>

      {hooks?.error && <div className="notice warn">{hooks.error}</div>}

      {hooks && !hooks.installed && (
        <div className="card onboard">
          <div>
            <h3>Turn on live tracking</h3>
            <p className="faint">
              Adds HTTP hooks to <code>{hooks.settingsPath}</code> (original backed up beside it) that post events to{' '}
              <code>127.0.0.1:{hooks.port}</code> only. If this app is closed, Claude Code is unaffected. Applies to sessions
              started afterwards.
            </p>
          </div>
          <button className="btn" disabled={busy} onClick={onInstall}>Enable live tracking</button>
        </div>
      )}

      <div className="stage">
        <div className="sessions">
          {current.map((g) => <SessionCard key={g.sessionId} g={g} now={now} />)}

          {current.length === 0 && (
            <div className="card empty">
              <span className="orb o-idle big" aria-hidden><i className="ring" /><i className="core">✦</i></span>
              <h3>{hooks?.installed ? 'Waiting for an agent' : 'No live agents'}</h3>
              <p className="faint">
                {hooks?.installed
                  ? 'Start or restart a Claude Code session — it will appear here the moment it does something.'
                  : 'Enable live tracking, then start a Claude Code session.'}
              </p>
            </div>
          )}

          {earlier.length > 0 && (
            <details className="earlier">
              <summary>Earlier sessions · {earlier.length}</summary>
              {earlier.map((g) => <SessionCard key={g.sessionId} g={g} now={now} />)}
            </details>
          )}
        </div>
        <Feed agents={agents} now={now} />
      </div>
    </section>
  )
}
