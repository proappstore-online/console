// Candidate routing is selected at build time; production ignores fixture inputs.
export const candidate = import.meta.env.MODE === 'candidate'
export const API_BASE = candidate ? '/v1' : 'https://api.proappstore.online/v1'
export const AGENT_BASE = candidate ? '/candidate-agents/v1' : 'https://agents.proappstore.online/v1'
export function agentSocketBase(): string {
  return candidate
    ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/candidate-agents/v1`
    : 'wss://agents.proappstore.online/v1'
}
