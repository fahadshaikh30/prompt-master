export type Status = 'idle' | 'working'

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': {
      status: Status
      previous: string | null
      lastRewrite: string | null
      priorRewrite: string | null
    }
  }
}
