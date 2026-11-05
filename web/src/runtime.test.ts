// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
describe('build-time routing', () => {
  it('keeps production routing independent of fixture environment variables', async () => {
    vi.stubEnv('MODE', 'production')
    vi.stubEnv('VITE_API_BASE', 'http://localhost:9999')
    const runtime = await import('./runtime')
    expect(runtime.API_BASE).toBe('https://api.proappstore.online/v1')
    expect(runtime.AGENT_BASE).toBe('https://agents.proappstore.online/v1')
    expect(runtime.agentSocketBase()).toBe('wss://agents.proappstore.online/v1')
  })
  it('routes candidate API and agent traffic to the harness origin', async () => {
    vi.stubEnv('MODE', 'candidate')
    const runtime = await import('./runtime')
    expect(runtime.API_BASE).toBe('/v1')
    expect(runtime.AGENT_BASE).toBe('/candidate-agents/v1')
    expect(new URL(runtime.agentSocketBase()).host).toBe(location.host)
  })
})
