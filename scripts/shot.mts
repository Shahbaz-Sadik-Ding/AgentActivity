// Visual check: feeds synthetic hook events into a running app (--remote-debugging-port=9333) and saves screenshots.
import fs from 'node:fs'
import path from 'node:path'

const PORT = process.env.AI_NOTCH_PORT ?? '47615'
const OUT = process.argv[2] ?? '.'
const token = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA!, 'ai-notch', 'config.json'), 'utf8')).token
const post = (o: object) => fetch(`http://127.0.0.1:${PORT}/hook/${token}`, { method: 'POST', body: JSON.stringify(o) })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const targets: any[] = await (await fetch('http://127.0.0.1:9333/json')).json()
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map<number, (v: any) => void>()
ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); pending.get(d.id)?.(d) }
const cdp = (method: string, params: object = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const js = (expression: string) => cdp('Runtime.evaluate', { expression, returnByValue: true }).then((d) => d.result?.result?.value)
const shot = async (name: string) => {
  const d = await cdp('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(OUT, name), Buffer.from(d.result.data, 'base64'))
}

const A = { session_id: 'aaaa1111-0000', cwd: 'C:\\Source\\ImageRepo' }
const B = { session_id: 'bbbb2222-0000', cwd: 'C:\\Source\\ConfigManager\\Src' }
const C = { session_id: 'cccc3333-0000', cwd: 'C:\\Source\\Otu\\Src' }
const D = { session_id: 'dddd4444-0000', cwd: 'C:\\Source\\Integrations' }

const call = async (s: object, tool: string, input: object, extra: object = {}) => {
  await post({ ...s, ...extra, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input })
  await post({ ...s, ...extra, hook_event_name: 'PostToolUse', tool_name: tool, tool_input: input })
}

await post({ ...A, hook_event_name: 'SessionStart' })
await post({ ...A, hook_event_name: 'UserPromptSubmit', prompt: 'Refactor the image resizer to stream instead of buffering' })
for (const [t, i] of [['Grep', { pattern: 'Resize' }], ['Read', { file_path: 'C:\\x\\ImageResizer.cs' }], ['Read', { file_path: 'C:\\x\\Startup.cs' }], ['Edit', { file_path: 'C:\\x\\ImageResizer.cs' }], ['Bash', { command: 'dotnet build', description: 'Build solution' }]] as const) await call(A, t, i)
await post({ ...A, hook_event_name: 'SubagentStart', agent_id: 'sx1', agent_type: 'Explore' })
await call(A, 'Glob', { pattern: '**/*.cs' }, { agent_id: 'sx1', agent_type: 'Explore' })
await post({ ...A, hook_event_name: 'PreToolUse', agent_id: 'sx1', agent_type: 'Explore', tool_name: 'Grep', tool_input: { pattern: 'IImageStore' } })
await post({ ...A, hook_event_name: 'SubagentStart', agent_id: 'sx2', agent_type: 'code-review' })
await call(A, 'Read', { file_path: 'C:\\x\\Review.md' }, { agent_id: 'sx2', agent_type: 'code-review' })
await post({ ...A, hook_event_name: 'SubagentStop', agent_id: 'sx2', agent_type: 'code-review', last_assistant_message: 'No blocking issues found.' })
await post({ ...A, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'dotnet test', description: 'Run unit tests' } })

await post({ ...B, hook_event_name: 'SessionStart' })
await call(B, 'Read', { file_path: 'C:\\x\\appsettings.json' })
await post({ ...B, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash: az keyvault secret list' })

await post({ ...C, hook_event_name: 'SessionStart' })
await post({ ...C, hook_event_name: 'UserPromptSubmit', prompt: 'Why is the nightly sync failing on tenant 12?' })
await call(C, 'WebSearch', { query: 'ef core timeout' })

await post({ ...D, hook_event_name: 'SessionStart' })
await call(D, 'Edit', { file_path: 'C:\\x\\Program.cs' })
await post({ ...D, hook_event_name: 'Stop', last_assistant_message: 'Done — the integration now retries on 429 with exponential backoff.' })

if (process.env.EVENTS_ONLY) {
  console.log('events loaded; staying on Agents tab')
  ws.close()
  process.exit(0)
}
await sleep(1800)
await cdp('Emulation.setDeviceMetricsOverride', { width: 1180, height: 1450, deviceScaleFactor: 1, mobile: false })
await sleep(400)
await shot('agents.png')
await js(`document.querySelector('[role=tab]:nth-child(3)').click()`)
await sleep(1500)
await shot('usage.png')
console.log('saved to', OUT)
ws.close()
