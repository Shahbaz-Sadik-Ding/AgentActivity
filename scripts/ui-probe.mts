// Drives a running app (started with --remote-debugging-port=9333): posts hook events, reads rendered text.
import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA!, 'ai-notch', 'config.json'), 'utf8')).token
const post = (o: object) =>
  fetch(`http://127.0.0.1:${process.env.AI_NOTCH_PORT ?? 47615}/hook/${token}`, { method: 'POST', body: JSON.stringify({ session_id: 'probe-1', cwd: 'C:\\Source\\probe', ...o }) })

const targets: any[] = await (await fetch('http://127.0.0.1:9333/json')).json()
const page = targets.find((t) => t.type === 'page')!
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map<number, (v: any) => void>()
ws.onmessage = (m) => {
  const d = JSON.parse(String(m.data))
  pending.get(d.id)?.(d)
}
const evalJs = (expression: string) =>
  new Promise<any>((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  }).then((d) => d.result?.result?.value)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.log('health:', (await fetch(`http://127.0.0.1:${process.env.AI_NOTCH_PORT ?? 47615}/health`)).status)
await post({ hook_event_name: 'SessionStart' })
await post({ hook_event_name: 'UserPromptSubmit', prompt: 'probe the dashboard' })
await post({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run test suite' } })
await post({ hook_event_name: 'SubagentStart', agent_id: 'sub9', agent_type: 'Explore' })
await sleep(1600)
const text: string = await evalJs('document.querySelector(".live").innerText')
console.log('---- live panel text ----\n' + text)
const tiles: string = await evalJs('document.querySelector(".tiles").innerText.replace(/\\n+/g," | ")')
console.log('---- tiles ----\n' + tiles)
const errs = await evalJs('window.__errs || "n/a"')
console.log('errors:', errs)
ws.close()
