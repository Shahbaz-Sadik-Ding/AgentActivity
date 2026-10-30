// End-to-end check of hook server + tracker + installer against a temp settings file.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-notch-e2e-'))
process.env.AI_NOTCH_SETTINGS = path.join(tmp, 'settings.json')

const { LiveTracker } = await import('../src/main/engine/live')
const { startHookServer } = await import('../src/main/engine/hookServer')
const inst = await import('../src/main/engine/hooksInstaller')
const { HOOK_PORT } = await import('../src/main/engine/config')

// --- installer: preserves user's existing settings and hooks
const original = {
  model: 'x',
  permissions: { allow: ['Bash(ls)'] },
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] }
}
fs.writeFileSync(process.env.AI_NOTCH_SETTINGS, JSON.stringify(original, null, 2))
inst.installHooks('tok123')
inst.installHooks('tok123') // idempotent
let s = JSON.parse(fs.readFileSync(process.env.AI_NOTCH_SETTINGS, 'utf8'))
assert.equal(s.model, 'x')
assert.deepEqual(s.permissions, original.permissions)
assert.equal(s.hooks.PreToolUse.length, 2, 'user hook kept + one of ours, no duplicates')
assert.equal(s.hooks.PreToolUse[0].hooks[0].command, 'echo hi')
assert.equal(inst.installedEvents().events.length, inst.HOOK_EVENTS.length)
assert.ok(fs.existsSync(process.env.AI_NOTCH_SETTINGS + '.ai-notch.bak'))
inst.uninstallHooks()
s = JSON.parse(fs.readFileSync(process.env.AI_NOTCH_SETTINGS, 'utf8'))
assert.deepEqual(s, original, 'uninstall restores the original content exactly')
fs.writeFileSync(process.env.AI_NOTCH_SETTINGS, '{ not json')
assert.throws(() => inst.installHooks('t'), 'refuses to overwrite unparseable settings')
assert.equal(fs.readFileSync(process.env.AI_NOTCH_SETTINGS, 'utf8'), '{ not json')
console.log('installer ok')

// --- server + tracker
const tracker = new LiveTracker()
const srv = await startHookServer(tracker, 'tok123', HOOK_PORT, () => {})
assert.ok(srv.listening, srv.error ?? 'not listening')
const post = (body: unknown, p = '/hook/tok123') =>
  fetch(`http://127.0.0.1:${HOOK_PORT}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const S = 'sess-1'
const ev = (o: object) => post({ session_id: S, cwd: 'C:\\Source\\demo', ...o })

assert.equal((await post({}, '/hook/wrong')).status, 404, 'wrong token rejected')
await ev({ hook_event_name: 'SessionStart' })
await ev({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the bug' })
await ev({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'C:\\Source\\demo\\a.ts' } })
let snap = tracker.snapshot()
assert.equal(snap.agents.length, 1)
assert.equal(snap.agents[0].status, 'tool')
assert.equal(snap.agents[0].currentDetail, 'a.ts')
await ev({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'C:\\Source\\demo\\a.ts' } })
await ev({ hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'Explore' })
await ev({ hook_event_name: 'PreToolUse', agent_id: 'ag1', agent_type: 'Explore', tool_name: 'Grep', tool_input: { pattern: 'foo' } })
snap = tracker.snapshot()
assert.equal(snap.agents.length, 2)
const main = snap.agents.find((a) => !a.agentId)!
const sub = snap.agents.find((a) => a.agentId === 'ag1')!
assert.equal(main.status, 'working')
assert.equal(main.toolCount, 1)
assert.equal(sub.status, 'tool')
assert.equal(sub.agentType, 'Explore')
await ev({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs permission to use Bash' })
assert.equal(tracker.snapshot().agents[0].status, 'waiting', 'waiting sorts first')
await ev({ hook_event_name: 'SubagentStop', agent_id: 'ag1', last_assistant_message: 'found it' })
await ev({ hook_event_name: 'Stop', last_assistant_message: 'All done' })
snap = tracker.snapshot()
assert.equal(snap.agents.find((a) => !a.agentId)!.status, 'idle')
assert.equal(snap.agents.find((a) => a.agentId)!.status, 'done')
assert.equal(snap.eventsReceived, 9)
assert.equal((await fetch(`http://127.0.0.1:${HOOK_PORT}/hook/tok123`, { method: 'POST', body: 'garbage' })).status, 200, 'garbage never errors')
await ev({ hook_event_name: 'SessionEnd' })
assert.ok(tracker.snapshot().agents.every((a) => a.status === 'ended'))
srv.close()
console.log('server + tracker ok')
fs.rmSync(tmp, { recursive: true, force: true })
