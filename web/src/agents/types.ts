// Shared types + constants for the agent-teams console view (AppAgents).

export type TicketStatus =
  | 'inbox' | 'ba-refining' | 'awaiting-approval' | 'ready'
  | 'dev-active' | 'qa-active' | 'qa-failed' | 'deploying' | 'needs-input' | 'done' | 'failed' | 'cancelled'

export interface Ticket {
  id: string
  seq: number
  title: string
  rawIdea: string
  status: TicketStatus
  assigneeRole: string | null
  iterations: number
  costSpentUsd: number
  updatedAt: number
  stuckReason: string | null
}

export interface Project {
  id: string
  name: string
  slug: string
  costCapMonthlyUsd: number
  costSpentMonthlyUsd: number
  status: 'running' | 'paused'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'po' | 'BA' | 'Dev' | 'QA' | 'system'
  text: string
  timestamp: number
  toolCall?: { name: string; args?: string }
  /** Optimistic local message not yet confirmed by the server. Preserved across
   *  server-snapshot reconciliation until the server echoes it (matched by text). */
  pending?: boolean
}

export interface ActivityEntry {
  id: string
  type: string
  detail: string
  timestamp: number
  meta?: string
}

// Per-app agent configuration: model, runtime, and output token cap per role.
export interface RoleCfg {
  role: string
  runtime: 'cf-native' | 'openai-responses'
  model: string
  maxTokens?: number
  persona?: string
  spineTools: string[]
  vendorTools: string[]
  systemPromptOverride?: string
}

export const COLUMNS: { keys: TicketStatus[]; label: string; color: string }[] = [
  { keys: ['inbox'], label: 'Inbox', color: '#94a3b8' },
  { keys: ['ba-refining', 'awaiting-approval'], label: 'BA', color: '#f59e0b' },
  { keys: ['ready', 'dev-active'], label: 'Dev', color: '#3b82f6' },
  { keys: ['qa-active', 'qa-failed'], label: 'QA', color: '#8b5cf6' },
  { keys: ['deploying'], label: 'Deploy', color: '#06b6d4' },
  { keys: ['needs-input'], label: 'Blocked', color: '#ef4444' },
  { keys: ['done'], label: 'Done', color: '#22c55e' },
  { keys: ['failed', 'cancelled'], label: 'Failed', color: '#b91c1c' },
]

export const ROLE_COLOR: Record<string, string> = {
  po: '#6366f1', BA: '#f59e0b', Dev: '#3b82f6', QA: '#8b5cf6', system: '#94a3b8', user: 'var(--ink)',
}

export const ROLE_INFO: { role: string; title: string; blurb: string }[] = [
  { role: 'po', title: 'PO — Product Owner', blurb: 'Reads your chat and turns it into tickets. Decides what gets built and in what order. This is who you talk to.' },
  { role: 'BA', title: 'BA — Business Analyst', blurb: 'Refines a ticket into a clear spec with acceptance criteria. Pushes back on vague requests instead of guessing.' },
  { role: 'Dev', title: 'Dev — Developer', blurb: 'Implements the approved spec — writes and edits the app’s files, then deploys.' },
  { role: 'QA', title: 'QA — Quality Assurance', blurb: 'Reviews the Dev’s work against the acceptance criteria. Passes it to Done, or sends it back for another pass.' },
]

export const MODEL_SUGGESTIONS: Record<string, string[]> = {
  // Anthropic Claude 4.x lineup (Opus = most capable, Haiku = fastest/cheapest).
  'cf-native': ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  'openai-responses': ['gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini'],
}
