import http from 'node:http'
import type { LiveTracker } from './live'

const MAX_BODY = 2 * 1024 * 1024

/** Loopback-only receiver for Claude Code HTTP hooks. Path: /hook/<token>. */
export function startHookServer(
  tracker: LiveTracker,
  token: string,
  port: number,
  onEvent: () => void
): Promise<{ close: () => void; listening: boolean; error: string | null }> {
  const handle = { close: () => {}, listening: false, error: null as string | null }
  const server = http.createServer((req, res) => {
    const reply = (code: number) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end('{}')
    }
    if (req.method === 'GET' && req.url === '/health') return reply(200)
    if (req.method !== 'POST' || req.url !== `/hook/${token}`) return reply(404)
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reply(413)
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        tracker.handle(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        onEvent()
      } catch {
        /* malformed payload: ignore, never block Claude Code */
      }
      reply(200)
    })
  })

  return new Promise((resolve) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      handle.error = err.code === 'EADDRINUSE' ? `Port ${port} is already in use (is another copy running?)` : err.message
      resolve(handle)
    })
    server.listen(port, '127.0.0.1', () => {
      handle.listening = true
      handle.close = () => server.close()
      resolve(handle)
    })
  })
}
