import { useCallback, useEffect, useState } from 'react'
import type { HooksStatus, LiveSnapshot, Summary } from '../../main/engine/types'
import { AgentsView } from './AgentsView'
import { UsageView } from './UsageView'
import icon from './icon.png'

type Tab = 'agents' | 'usage'
type Motion = 'eco' | 'full' | 'off'
const MOTION_LABEL: Record<Motion, string> = { eco: 'Eco', full: 'Smooth', off: 'Still' }
const NEXT_MOTION: Record<Motion, Motion> = { eco: 'full', full: 'off', off: 'eco' }

const ECO_MS = 150 // eco animation clock period (~6-7 fps)

const loadMotion = (): Motion => {
  try {
    const v = localStorage.getItem('motion')
    if (v === 'eco' || v === 'full' || v === 'off') return v
  } catch {
    /* storage unavailable: use default */
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'eco'
}

export function App() {
  const [tab, setTab] = useState<Tab>('agents')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [live, setLive] = useState<LiveSnapshot | null>(null)
  const [hooks, setHooks] = useState<HooksStatus | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [motion, setMotion] = useState<Motion>(loadMotion)

  useEffect(() => {
    document.documentElement.dataset.motion = motion
    try {
      localStorage.setItem('motion', motion)
    } catch {
      /* ignore */
    }
  }, [motion])

  const liveAgents = live?.agents.filter((a) => a.status !== 'ended' && a.status !== 'done') ?? []
  const needs = liveAgents.filter((a) => a.status === 'waiting').length
  const animating = liveAgents.some((a) => a.status === 'tool' || a.status === 'working' || a.status === 'waiting')

  // Eco clock: one timer drives every looping animation (see styles.css). It only runs while something is animating
  // and the window is visible, so an idle or hidden app does no work at all.
  useEffect(() => {
    if (motion !== 'eco' || !animating) return
    const root = document.documentElement
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (!document.hidden) root.style.setProperty('--t', (performance.now() / 1000).toFixed(3))
      timer = setTimeout(tick, Number((window as unknown as { __ecoMs?: number }).__ecoMs) || ECO_MS)
    }
    tick()
    return () => clearTimeout(timer)
  }, [motion, animating])

  useEffect(() => {
    window.api.getSummary().then(setSummary)
    window.api.getLive().then(setLive)
    window.api.hooksStatus().then(setHooks)
    const offs = [window.api.onSummary(setSummary), window.api.onLive(setLive)]

    // Pause animations and the 1s clock while the window is hidden or minimised.
    const root = document.documentElement
    const sync = () => {
      root.dataset.paused = document.hidden ? '1' : ''
      if (!document.hidden) setNow(Date.now())
    }
    document.addEventListener('visibilitychange', sync)
    const t = setInterval(() => !document.hidden && setNow(Date.now()), 1000)
    return () => {
      offs.forEach((o) => o())
      document.removeEventListener('visibilitychange', sync)
      clearInterval(t)
    }
  }, [])

  const act = useCallback(async (fn: () => Promise<HooksStatus>) => {
    setBusy(true)
    try {
      setHooks(await fn())
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img className="mark" src={icon} alt="" />
          <span>Agent Activity</span>
        </div>

        <nav className="seg" role="tablist" data-active={tab}>
          <i className="thumb" />
          <button role="tab" aria-selected={tab === 'agents'} onClick={() => setTab('agents')}>
            Agents{liveAgents.length > 0 && <em className={needs ? 'alert' : ''}>{liveAgents.length}</em>}
          </button>
          <button role="tab" aria-selected={tab === 'usage'} onClick={() => setTab('usage')}>Usage</button>
        </nav>

        <div className="status">
          <button
            className="motion"
            onClick={() => setMotion(NEXT_MOTION[motion])}
            title="Animation: Eco uses coarse steps to save CPU, Smooth runs at full frame rate, Still turns animation off"
          >
            Motion · {MOTION_LABEL[motion]}
          </button>
          {hooks?.installed ? (
            <span className="live"><i />Live</span>
          ) : (
            <span className="off"><i />Tracking off</span>
          )}
        </div>
      </header>

      <main>
        {tab === 'agents' && (
          <AgentsView
            live={live}
            hooks={hooks}
            now={now}
            busy={busy}
            onInstall={() => act(window.api.installHooks)}
            onUninstall={() => act(window.api.uninstallHooks)}
          />
        )}
        {tab === 'usage' && (summary ? <UsageView s={summary} /> : <div className="view faint">Scanning Claude Code logs…</div>)}
      </main>
    </div>
  )
}
