// Inject (or clear) an experimental stylesheet into the running app and report page state:
//   node inject.mts "<css>"   ->  prints "hidden=<bool> animations=<n> running=<n>"
const css = process.argv[2] ?? ''
const targets: any[] = await (await fetch('http://127.0.0.1:9333/json')).json()
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map<number, (v: any) => void>()
ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); pending.get(d.id)?.(d) }
const send = (method: string, params: object = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.bringToFront')
await send('Runtime.evaluate', {
  expression: `(()=>{let s=document.getElementById('exp');if(!s){s=document.createElement('style');s.id='exp';document.head.appendChild(s)}s.textContent=${JSON.stringify(css)}})()`
})
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({hidden:document.hidden,animations:document.getAnimations().length,running:document.getAnimations().filter(a=>a.playState==='running').length})`,
  returnByValue: true
})
const s = JSON.parse(r.result.result.value)
console.log(`hidden=${s.hidden} animations=${s.animations} running=${s.running}`)
ws.close()
