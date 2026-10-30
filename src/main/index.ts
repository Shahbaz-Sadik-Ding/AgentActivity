import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { ClaudeScanner } from './engine/scanner'
import { summarize } from './engine/aggregate'
import { HOOK_PORT, loadConfig } from './engine/config'
import { LiveTracker } from './engine/live'
import { startHookServer } from './engine/hookServer'
import { HOOK_EVENTS, installHooks, installedEvents, settingsPath, uninstallHooks } from './engine/hooksInstaller'
import type { HooksStatus, Summary } from './engine/types'

const scanner = new ClaudeScanner()
const tracker = new LiveTracker()
let win: BrowserWindow | null = null
let latest: Summary | null = null
let server: { close: () => void; listening: boolean; error: string | null } | null = null
let token = ''

// Live cards show exact per-agent token counts from the same data the dashboard uses.
tracker.setUsageLookup((session, agent) => latest?.perAgentTokens[`${session}:${agent ?? ''}`] ?? 0)

function refresh(force = false): void {
  if (scanner.scan() || force || !latest) {
    latest = summarize(scanner.all(), scanner.allSegments(), scanner.recordedBySession())
    win?.webContents.send('summary', latest)
  }
}

let liveTimer: NodeJS.Timeout | null = null
function pushLive(): void {
  if (liveTimer) return
  liveTimer = setTimeout(() => {
    liveTimer = null
    win?.webContents.send('live', tracker.snapshot())
  }, 120)
}

function hooksStatus(): HooksStatus {
  const { events, error } = installedEvents()
  return {
    installed: events.length === HOOK_EVENTS.length,
    events,
    settingsPath: settingsPath(),
    port: HOOK_PORT,
    serverListening: server?.listening ?? false,
    error: error ?? server?.error ?? null
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0f1115',
    title: 'Agent Activity',
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

// The app used to be called ai-notch; keep its data folder so the saved hook token and settings carry over.
app.setPath('userData', join(app.getPath('appData'), 'ai-notch'))
app.setAppUserModelId('Agent Activity')

app.whenReady().then(async () => {
  token = loadConfig(app.getPath('userData')).token
  server = await startHookServer(tracker, token, HOOK_PORT, pushLive)

  ipcMain.handle('get-summary', () => {
    refresh(true)
    return latest
  })
  ipcMain.handle('get-live', () => tracker.snapshot())
  ipcMain.handle('hooks-status', () => hooksStatus())
  ipcMain.handle('hooks-install', () => {
    try {
      installHooks(token)
    } catch (e) {
      return { ...hooksStatus(), error: `Install failed: ${(e as Error).message}` }
    }
    return hooksStatus()
  })
  ipcMain.handle('hooks-uninstall', () => {
    try {
      uninstallHooks()
    } catch (e) {
      return { ...hooksStatus(), error: `Uninstall failed: ${(e as Error).message}` }
    }
    return hooksStatus()
  })

  createWindow()
  refresh(true)
  setInterval(() => refresh(), 2000)
  setInterval(() => win?.webContents.send('live', tracker.snapshot()), 1000)
})

app.on('window-all-closed', () => {
  server?.close()
  app.quit()
})
