/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppRecruitment } from './AppRecruitment'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const saved = (accepting_requests = true, appId = 'a') => ({ appId, accepting_requests, updated_at: null })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('reads the saved setting privately and waits for a confirmed write before changing it', async () => {
  let finish: (r: Response) => void = () => {}
  const fetch = vi.fn().mockResolvedValueOnce(response(saved())).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetch)
  render(<AppRecruitment appId="a" token="owner" />)
  const input = await screen.findByRole('checkbox') as HTMLInputElement
  expect(input.checked).toBe(true)
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/apps/a/team/recruitment'), expect.objectContaining({ cache: 'no-store', credentials: 'omit', headers: expect.objectContaining({ Authorization: 'Bearer owner' }) }))
  fireEvent.click(input)
  expect(input.checked).toBe(true)
  expect(input.disabled).toBe(true)
  expect(fetch.mock.calls[1]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ accepting_requests: false }) })
  finish(response(saved(false)))
  await screen.findByText('Requests are closed. Existing enquiries remain in your inbox.')
  expect(input.checked).toBe(false)
  expect(input.disabled).toBe(false)
})

it.each([401, 403, 404, 500])('does not pretend recruitment is open when reading fails (%s)', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'unavailable' }, status)))
  render(<AppRecruitment appId="a" token="t" />)
  await screen.findByRole('alert')
  expect(screen.queryByRole('checkbox')).toBeNull()
})

it('clears uncertain settings after a failed write and recovers by reading the current value', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(saved())).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(saved(false))))
  render(<AppRecruitment appId="a" token="t" />)
  fireEvent.click(await screen.findByRole('checkbox'))
  await screen.findByText(/Could not confirm the recruitment update/)
  expect(screen.queryByRole('checkbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh recruitment settings' }))
  expect((await screen.findByRole('checkbox') as HTMLInputElement).checked).toBe(false)
})

it.each([{ ...saved(), accepting_requests: 'true' }, saved(true, 'other'), { ...saved(), updated_at: -1 }])('rejects malformed or cross-app settings', async value => {
  vi.stubGlobal('fetch', vi.fn(async () => response(value)))
  render(<AppRecruitment appId="a" token="t" />)
  await screen.findByRole('alert')
  expect(screen.queryByRole('checkbox')).toBeNull()
})

it('ignores a late previous-app write after the owner switches apps', async () => {
  let finish: (r: Response) => void = () => {}
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(saved())).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve })).mockResolvedValueOnce(response(saved(true, 'b'))))
  const { rerender } = render(<AppRecruitment appId="a" token="old" />)
  fireEvent.click(await screen.findByRole('checkbox'))
  rerender(<AppRecruitment appId="b" token="new" />)
  await screen.findByText('Requests are open while this app is public and listed.')
  finish(response(saved(false)))
  await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true))
})
