import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const HOOK_PORT = Number(process.env.AI_NOTCH_PORT) || 47615

export interface AppConfig {
  token: string
}

/** Persists a random path token so only hooks we installed can post events. */
export function loadConfig(dir: string): AppConfig {
  const file = path.join(dir, 'config.json')
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof c.token === 'string' && c.token.length >= 16) return c
  } catch {
    /* first run */
  }
  const cfg: AppConfig = { token: crypto.randomBytes(16).toString('hex') }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2))
  return cfg
}
