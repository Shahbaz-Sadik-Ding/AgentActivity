// node setmotion.mts <eco|full|off> [ecoMs] — sets the app's motion mode like the header button, prints page state
const mode = process.argv[2] ?? 'eco'
const ms = process.argv[3] ? Number(process.argv[3]) : 0
const targets: any[] = await (await fetch('http://127.0.0.1:9333/json')).json()
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `window.__ecoMs=${ms};document.documentElement.dataset.motion=${JSON.stringify(mode)};JSON.stringify({hidden:document.hidden,running:document.getAnimations().filter(a=>a.playState==='running').length,paused:document.getAnimations().filter(a=>a.playState==='paused').length})`,
      returnByValue: true
    }
  })
)
const d: any = await new Promise((r) => (ws.onmessage = (m) => r(JSON.parse(String(m.data)))))
console.log(d.result.result.value)
ws.close()
