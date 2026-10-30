/// <reference types="vite/client" />
import type { HooksStatus, LiveSnapshot, Summary } from '../../main/engine/types'

declare global {
  interface Window {
    api: {
      getSummary: () => Promise<Summary>
      onSummary: (cb: (s: Summary) => void) => () => void
      getLive: () => Promise<LiveSnapshot>
      onLive: (cb: (s: LiveSnapshot) => void) => () => void
      hooksStatus: () => Promise<HooksStatus>
      installHooks: () => Promise<HooksStatus>
      uninstallHooks: () => Promise<HooksStatus>
    }
  }
}

export {}
