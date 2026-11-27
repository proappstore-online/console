import type { DeveloperReputation } from './developerReputationApi'

export const reputation = (): DeveloperReputation => ({
  version: 1, policy_version: 1, generated_at: 1795000000000, identity: 'verified_github', scope: 'current_authorized_apps',
  apps: [{ app_id: 'example-app', role: 'developer', membership_observed_since: 1794000000000, state: 'ok', state_reason: 'Complete and fresh.', verified: true,
    counts: { commits: 3, additions: 42, deletions: 7 }, first_recorded_commit_at: 1794000000000, last_recorded_commit_at: 1795000000000, last_refreshed_at: 1795000000000 }],
  summary: { current_apps: 1, verified_contributed_repositories: 1, incomplete_apps: 0 },
  badges: [{ id: 'code-contributor', label: 'Code contributor', evidence: 'At least one eligible commit in a complete, fresh, verified repository.' }],
  history_note: 'Only apps you currently own or belong to are included. This is not lifetime participation or ownership.',
})
