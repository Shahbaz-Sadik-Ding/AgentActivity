import { contextBridge, ipcRenderer } from 'electron'
import type { HooksStatus, LiveSnapshot, Summary } from '../main/engine/types'

const subscribe =
  <T>(channel: string) =>
  (cb: (v: T) => void) => {
    const h = (_: unknown, v: T) => cb(v)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  }

contextBridge.exposeInMainWorld('api', {
  getSummary: (): Promise<Summary> => ipcRenderer.invoke('get-summary'),
  onSummary: subscribe<Summary>('summary'),
  getLive: (): Promise<LiveSnapshot> => ipcRenderer.invoke('get-live'),
  onLive: subscribe<LiveSnapshot>('live'),
  hooksStatus: (): Promise<HooksStatus> => ipcRenderer.invoke('hooks-status'),
  installHooks: (): Promise<HooksStatus> => ipcRenderer.invoke('hooks-install'),
  uninstallHooks: (): Promise<HooksStatus> => ipcRenderer.invoke('hooks-uninstall')
})
