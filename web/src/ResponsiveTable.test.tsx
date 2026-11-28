/**
 * @vitest-environment jsdom
 */
// console#27: one table component — a named table from `sm` up, labelled cards below it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ResponsiveTable, TruncatedId } from './ResponsiveTable'

const rows = [{ id: 'google:103954887935449123398', n: 3 }, { id: 'u2', n: 1 }]
const table = (
  <ResponsiveTable caption="Members" rows={rows} rowKey={(r) => r.id} foot={['Total', '4', null]} columns={[
    { key: 'id', header: 'User', cell: (r) => <TruncatedId value={r.id} label="user id" /> },
    { key: 'n', header: 'Pockets', className: 'text-right', cell: (r) => r.n },
    { key: 'act', header: <span className="sr-only">Actions</span>, label: '', cell: () => <button type="button">Open</button> },
  ]} />
)
const screenWidth = (wide: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener() {}, removeEventListener() {} }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ResponsiveTable', () => {
  it('is a named table on wide screens, with a footer row', () => {
    screenWidth(true)
    render(table)
    const t = screen.getByRole('table', { name: 'Members' })
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['User', 'Pockets', 'Actions'])
    expect(within(t).getAllByRole('row').map((r) => r.textContent)).toEqual(['UserPocketsActions', 'google:1039548879354491233983Open', 'u21Open', 'Total4'])
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('is a list of labelled cards on narrow screens; an unlabelled column spans the card', () => {
    screenWidth(false)
    render(table)
    expect(screen.queryByRole('table')).toBeNull()
    const cards = within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem')
    expect(cards).toHaveLength(3) // two rows and the totals
    expect(within(cards[0]!).getAllByRole('term').map((t) => t.textContent)).toEqual(['User', 'Pockets'])
    expect(within(cards[0]!).getAllByRole('definition').map((d) => d.textContent)).toEqual(['google:103954887935449123398', '3'])
    expect(within(cards[0]!).getByRole('button', { name: 'Open' })).toBeTruthy()
  })

  it('a truncated id keeps its full value in its title and offers to copy it', () => {
    render(<TruncatedId value="google:103954887935449123398" label="user id" />)
    expect(screen.getByTitle('google:103954887935449123398').textContent).toBe('google:103954887935449123398')
    expect(screen.getByRole('button', { name: 'Copy user id' })).toBeTruthy()
  })
})
