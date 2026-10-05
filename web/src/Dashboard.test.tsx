/**
 * @vitest-environment jsdom
 */
// Regression for proappstore-online/platform#288: a long app name widened its
// card, the grid and the page (horizontal scroll). Grid and flex items default to
// `min-width: auto`, so `truncate` on the name never applied. jsdom does no
// layout, so this pins the classes that let the card shrink, and the title that
// keeps the full name readable.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('./sdk', () => ({
  pro: { auth: { token: 't' }, subscription: { status: async () => null } },
}))
vi.mock('./usage', async (orig) => ({
  ...(await orig<typeof import('./usage')>()),
  fetchOwnerSummary: async () => null,
}))

import { Dashboard } from './Dashboard'

const LONG_NAME = 'This Is An Extremely Long Application Name That Should Be Truncated With Ellipsis'
const LONG_ID = 'this-is-an-extremely-long-application-id-that-should-be-truncated'

afterEach(cleanup)

describe('Dashboard app cards (#288)', () => {
  it('constrains a very long app name and id to the card', async () => {
    render(
      <Dashboard
        user={{ id: 'u1', login: 'octo', name: 'octo', avatarUrl: null } as never}
        apps={[{ id: LONG_ID, name: LONG_NAME, createdAt: '2026-10-01T00:00:00Z' }]}
        onOpenApp={() => {}}
        onPublishNew={() => {}}
        onNewApp={() => {}}
      />,
    )

    const name = await screen.findByText(LONG_NAME)
    expect(name.className).toMatch(/\btruncate\b/)
    expect(name.className).toMatch(/\bmin-w-0\b/)
    expect(name.getAttribute('title')).toBe(LONG_NAME)

    const card = name.closest('button')!
    expect(card.className).toMatch(/\bmin-w-0\b/)
    expect(card.className).toMatch(/\bw-full\b/)

    const id = screen.getByText(LONG_ID)
    expect(id.className).toMatch(/\btruncate\b/)
    expect(id.getAttribute('title')).toBe(LONG_ID)
  })
})
