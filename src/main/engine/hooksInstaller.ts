import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { HOOK_PORT } from './config'

export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'SessionEnd'
]

export const settingsPath = (): string =>
  process.env.AI_NOTCH_SETTINGS ?? path.join(os.homedir(), '.claude', 'settings.json')

const urlFor = (token: string) => `http://127.0.0.1:${HOOK_PORT}/hook/${token}`
/** Ours = any http hook pointing at our loopback port, whatever the token. */
const isOurs = (h: any) => h?.type === 'http' && typeof h.url === 'string' && h.url.startsWith(`http://127.0.0.1:${HOOK_PORT}/hook/`)

function read(file: string): any {
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, 'utf8')) // throws on invalid JSON: we never overwrite a file we can't parse
}

function write(file: string, data: any): void {
  if (fs.existsSync(file)) {
    const bak = `${file}.ai-notch.bak`
    if (!fs.existsSync(bak)) fs.copyFileSync(file, bak) // keep the first pristine copy
  } else fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.ai-notch.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

export function installedEvents(): { events: string[]; error: string | null } {
  try {
    const s = read(settingsPath())
    const events = Object.entries<any[]>(s.hooks ?? {})
      .filter(([, groups]) => Array.isArray(groups) && groups.some((g) => g?.hooks?.some(isOurs)))
      .map(([ev]) => ev)
    return { events, error: null }
  } catch (e) {
    return { events: [], error: `Cannot read ${settingsPath()}: ${(e as Error).message}` }
  }
}

export function installHooks(token: string): void {
  const file = settingsPath()
  const s = read(file)
  s.hooks ??= {}
  for (const ev of HOOK_EVENTS) {
    const groups: any[] = Array.isArray(s.hooks[ev]) ? s.hooks[ev] : []
    // drop any previous copy of ours (e.g. old token), keep everything else untouched
    const kept = groups
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h: any) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0)
    kept.push({ hooks: [{ type: 'http', url: urlFor(token), timeout: 5 }] })
    s.hooks[ev] = kept
  }
  write(file, s)
}

export function uninstallHooks(): void {
  const file = settingsPath()
  if (!fs.existsSync(file)) return
  const s = read(file)
  if (!s.hooks) return
  for (const ev of Object.keys(s.hooks)) {
    const groups: any[] = Array.isArray(s.hooks[ev]) ? s.hooks[ev] : []
    const kept = groups
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h: any) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0)
    if (kept.length) s.hooks[ev] = kept
    else delete s.hooks[ev]
  }
  if (Object.keys(s.hooks).length === 0) delete s.hooks
  write(file, s)
}
