import { describe, it, expect } from 'vitest'
import { parseHash, hashFor, deriveSlug, mergeApps, type AppEntry } from './nav'

describe('parseHash', () => {
  it('defaults to dashboard for empty/`#`/`#/`', () => {
    expect(parseHash('')).toEqual({ view: 'dashboard', param: null, tab: null })
    expect(parseHash('#')).toEqual({ view: 'dashboard', param: null, tab: null })
    expect(parseHash('#/')).toEqual({ view: 'dashboard', param: null, tab: null })
    expect(parseHash('#/dashboard')).toEqual({ view: 'dashboard', param: null, tab: null })
  })

  it('parses an app-detail route with its slug param', () => {
    expect(parseHash('#/apps/interns')).toEqual({ view: 'app-detail', param: 'interns', tab: null })
    expect(parseHash('#/apps/my-cool-app')).toEqual({ view: 'app-detail', param: 'my-cool-app', tab: null })
  })

  it('parses an app-detail route with a deep-linked tab', () => {
    expect(parseHash('#/apps/interns/research')).toEqual({ view: 'app-detail', param: 'interns', tab: 'research' })
    expect(parseHash('#/apps/interns/devops')).toEqual({ view: 'app-detail', param: 'interns', tab: 'devops' })
    expect(parseHash('#/apps/interns/settings')).toEqual({ view: 'app-detail', param: 'interns', tab: 'settings' })
  })

  it('ignores an unrecognized tab segment (tab: null)', () => {
    expect(parseHash('#/apps/interns/bogus')).toEqual({ view: 'app-detail', param: 'interns', tab: null })
  })

  it('treats a bare `apps/` (no slug) as dashboard, not a broken app-detail', () => {
    expect(parseHash('#/apps/')).toEqual({ view: 'dashboard', param: null, tab: null })
  })

  it('parses known top-level views', () => {
    for (const v of ['publish', 'payouts', 'subscription', 'admin', 'profile', 'ui-library'] as const) {
      expect(parseHash(`#/${v}`)).toEqual({ view: v, param: null, tab: null })
    }
  })

  it('falls back to dashboard for unknown routes', () => {
    expect(parseHash('#/totally-unknown')).toEqual({ view: 'dashboard', param: null, tab: null })
  })
})

describe('hashFor', () => {
  it('is the inverse of parseHash', () => {
    expect(hashFor('dashboard')).toBe('#/')
    expect(hashFor('publish')).toBe('#/publish')
    expect(hashFor('app-detail', 'interns')).toBe('#/apps/interns')
  })

  it('appends the tab for app-detail routes that carry one', () => {
    expect(hashFor('app-detail', 'interns', 'devops')).toBe('#/apps/interns/devops')
    expect(hashFor('app-detail', 'interns', null)).toBe('#/apps/interns')
    // a tab without a param is meaningless — no app route, no tab
    expect(hashFor('dashboard', null, 'devops')).toBe('#/')
  })

  it('round-trips a parsed app-detail route (with + without tab)', () => {
    const bare = parseHash('#/apps/foo-bar')
    expect(hashFor(bare.view, bare.param, bare.tab)).toBe('#/apps/foo-bar')
    const tabbed = parseHash('#/apps/foo-bar/research')
    expect(hashFor(tabbed.view, tabbed.param, tabbed.tab)).toBe('#/apps/foo-bar/research')
  })

  it('app-detail without a param falls back to the bare view (no slug)', () => {
    // Doesn't occur in practice (app-detail always carries a slug); documents the edge.
    expect(hashFor('app-detail', null)).toBe('#/app-detail')
  })
})

describe('deriveSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(deriveSlug('My Cool App')).toBe('my-cool-app')
    expect(deriveSlug('Hello, World!')).toBe('hello-world')
  })

  it('trims leading/trailing separators', () => {
    expect(deriveSlug('  spaced  ')).toBe('spaced')
    expect(deriveSlug('---dashes---')).toBe('dashes')
  })

  it('prefixes `app-` when it would start with a non-letter', () => {
    expect(deriveSlug('123 game')).toBe('app-123-game')
  })

  it('returns empty string when there is nothing usable', () => {
    expect(deriveSlug('!!!')).toBe('')
    expect(deriveSlug('   ')).toBe('')
  })

  it('caps length at 56 chars', () => {
    expect(deriveSlug('a'.repeat(100)).length).toBe(56)
  })
})

describe('mergeApps', () => {
  const app = (id: string, createdAt: string): AppEntry => ({ id, name: id, createdAt })

  it('marks published apps and flags those that also have an agent team', () => {
    const merged = mergeApps(
      [app('alpha', '2026-01-01T00:00:00.000Z')],
      [{ slug: 'alpha', name: 'Alpha', createdAt: 0 }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'alpha', published: true, hasAgentTeam: true })
  })

  it('adds project-only (unpublished) entries from agent-teams projects', () => {
    const merged = mergeApps([], [{ slug: 'beta', name: 'Beta', createdAt: 1_700_000_000_000 }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'beta', name: 'Beta', published: false, hasAgentTeam: true })
    expect(merged[0]!.createdAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('dedupes by id (a published app is not duplicated by its project)', () => {
    const merged = mergeApps(
      [app('gamma', '2026-02-01T00:00:00.000Z')],
      [{ slug: 'gamma', name: 'Gamma', createdAt: 0 }, { slug: 'delta', name: 'Delta', createdAt: 0 }],
    )
    expect(merged.map((a) => a.id).sort()).toEqual(['delta', 'gamma'])
  })

  it('sorts newest-first by createdAt', () => {
    const merged = mergeApps(
      [app('old', '2025-01-01T00:00:00.000Z'), app('new', '2026-01-01T00:00:00.000Z')],
      [],
    )
    expect(merged.map((a) => a.id)).toEqual(['new', 'old'])
  })

  it('a published app without a matching project has hasAgentTeam=false', () => {
    const merged = mergeApps([app('solo', '2026-01-01T00:00:00.000Z')], [])
    expect(merged[0]).toMatchObject({ published: true, hasAgentTeam: false })
  })
})
