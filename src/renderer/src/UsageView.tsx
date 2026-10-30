import { useState } from 'react'
import type { Summary } from '../../main/engine/types'
import { allTok, fmtN, fmtTime, fmtUsd, projName } from './util'

type Metric = 'cost' | 'tokens'

/** Plain-div bar chart: bars scale with transform, so there is no chart library and no layout work on hover. */
function Bars({ data, metric }: { data: Array<{ date: string; v: number }>; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1e-9, ...data.map((d) => d.v))
  const fmt = (v: number) => (metric === 'cost' ? fmtUsd(v) : fmtN(v))
  const shown = hover != null ? data[hover] : null
  return (
    <div className="chart">
      <div className="readout">
        {shown ? (
          <>
            <b>{fmt(shown.v)}</b>
            <span className="faint">{shown.date}</span>
          </>
        ) : (
          <span className="faint">Hover a bar</span>
        )}
        <span className="spacer" />
        <span className="faint">peak {fmt(max)}</span>
      </div>
      <div className="bars" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={d.date} className={`col${hover === i ? ' hot' : ''}`} onMouseEnter={() => setHover(i)}>
            <i style={{ transform: `scaleY(${Math.max(d.v / max, d.v > 0 ? 0.02 : 0)})` }} />
          </div>
        ))}
      </div>
      <div className="axis">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  )
}

export function UsageView({ s }: { s: Summary }) {
  const [metric, setMetric] = useState<Metric>('cost')
  const r = s.recorded
  const monthName = new Date(s.generatedAt).toLocaleString([], { month: 'long', timeZone: 'UTC' })
  const days = s.daily.slice(-30).map((d) => ({ date: d.date, v: metric === 'cost' ? d.cost : allTok(d) }))
  const cacheShare = (s.tokens.total.cacheRead / Math.max(1, allTok(s.tokens.total))) * 100

  return (
    <section className="view">
      <div className="hero card">
        <div>
          <div className="eyebrow">Recorded cost · {monthName} (UTC)</div>
          <div className="big">{fmtUsd(r.month)}</div>
          <div className="faint">
            {r.monthStraddling > 0 ? `excludes ${fmtUsd(r.monthStraddling)} recorded across a month boundary · ` : ''}
            all time {fmtUsd(r.total)} over {r.sessionsWithCost} sessions
          </div>
        </div>
        <div className="hero-stats">
          <div><b>{fmtN(allTok(s.tokens.month))}</b><span>tokens this month</span></div>
          <div><b>{fmtN(allTok(s.tokens.today))}</b><span>tokens today</span></div>
          <div><b>{fmtN(allTok(s.tokens.last7Days))}</b><span>last 7 days</span></div>
          <div><b>{cacheShare.toFixed(0)}%</b><span>cache reads</span></div>
        </div>
      </div>

      <div className="notice">
        Nothing here is estimated. Tokens are counted from your Claude Code logs; cost is Claude Code’s own recorded figure
        (not the Anthropic bill, so it can differ from the usage page in the Claude app).
        {r.sessionsWithoutCost > 0 && (
          <> {r.sessionsWithoutCost} session{r.sessionsWithoutCost > 1 ? 's' : ''} ({fmtN(r.tokensWithoutCost)} tokens) have no recorded cost yet and show “—”.</>
        )}
      </div>

      <div className="cols">
        <div className="stack">
        <div className="card">
          <div className="card-head">
            <h2>Daily · last 30 days (UTC)</h2>
            <span className="spacer" />
            <div className="seg small">
              <button className={metric === 'cost' ? 'on' : ''} onClick={() => setMetric('cost')}>Cost</button>
              <button className={metric === 'tokens' ? 'on' : ''} onClick={() => setMetric('tokens')}>Tokens</button>
            </div>
          </div>
          <Bars data={days} metric={metric} />
          {metric === 'cost' && (
            <div className="faint small">
              Bars show only cost Claude Code recorded within a single day.
              {r.unallocated > 0 && ` ${fmtUsd(r.unallocated)} this month was recorded across several days and is in the totals but not in any bar.`}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Recent sessions</h2>
          <table>
            <thead>
              <tr><th>Project</th><th>Last active</th><th className="num">Subagents</th><th className="num">Tokens</th><th className="num">Cost</th></tr>
            </thead>
            <tbody>
              {s.sessions.slice(0, 12).map((x) => (
                <tr key={x.sessionId}>
                  <td className="trunc" title={x.project}>{projName(x.project)}</td>
                  <td>{fmtTime(x.end)}</td>
                  <td className="num">{x.subagents}</td>
                  <td className="num">{fmtN(allTok(x))}</td>
                  <td className="num">{fmtUsd(x.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>

        <div className="stack">
        <div className="card">
          <h2>By model</h2>
          <table>
            <thead><tr><th>Model</th><th className="num">Msgs</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {s.byModel.filter((m) => m.messages > 0 || (m.cost ?? 0) >= 0.005).map((m) => (
                <tr key={m.model}><td>{m.model.replace('claude-', '')}</td><td className="num">{m.messages}</td><td className="num">{fmtUsd(m.cost)}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 className="gap">Top tools</h2>
          <table>
            <tbody>
              {s.byTool.slice(0, 8).map((t) => (
                <tr key={t.tool}><td>{t.tool}</td><td className="num">{t.count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>By project</h2>
          <table>
            <tbody>
              {s.byProject.slice(0, 10).map((p) => (
                <tr key={p.project}><td className="trunc" title={p.project}>{projName(p.project)}</td><td className="num">{fmtUsd(p.cost)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </section>
  )
}
