// @vitest-environment jsdom
// Console#12: the repaired compliance baseline. The CLI itself is the full gate (compliance.yml, pinned);
// these tests keep the specific repairs from regressing between CLI runs and prove the label fixes work
// for real assistive technology, not just for the static scanner.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NewAppModal } from './NewAppModal'
import { RejectModal } from './RejectModal'
import { SubmissionForm } from './SubmissionForm'
import workflow from '../../.github/workflows/compliance.yml?raw'
import html from '../index.html?raw'
import config from '../vite.config.ts?raw'

afterEach(cleanup)

describe('compliance pin (console#12)', () => {
  it('pins an explicit CLI version through the reusable workflow input, not its default or "latest"', () => {
    expect(workflow).toMatch(/uses: proappstore-online\/proappstore\/\.github\/workflows\/app-ci\.yml@/)
    const m = /compliance_cli_version:\s*"(\d+\.\d+\.\d+)"/.exec(workflow)
    expect(m).not.toBeNull()
    expect(m![1]).not.toBe('2.2.0') // the stale default that mis-reported unchanged files
    expect(workflow).not.toMatch(/latest/)
  })
})

describe('index.html head and scripts (console#12)', () => {
  it('has a twitter:image alongside og:image', () => {
    expect(html).toMatch(/<meta name="twitter:image" content="https:\/\/console\.proappstore\.online\/[^"]+"/)
    expect(html).toMatch(/<meta property="og:image"/)
  })

  it('loads no remote or non-bundled script (initial JS must be measurable under assets/)', () => {
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
    expect(srcs).toEqual(['/src/main.tsx']) // Vite rewrites this into assets/; nothing remote, no dead placeholder beacon
    expect(html).not.toContain('PROAPPSTORE_CONSOLE_CF_BEACON_TOKEN')
  })
})

describe('PWA config (console#12)', () => {
  it('never lets the service worker answer /.pas/* navigations with the app shell', () => {
    const m = /navigateFallbackDenylist:\s*\[([^\]]+)\]/.exec(config)
    expect(m).not.toBeNull()
    const pattern = new RegExp(m![1]!.trim().replace(/^\/|\/$/g, ''))
    expect(pattern.test('/.pas/auth/callback')).toBe(true)
    expect(pattern.test('/app/')).toBe(false)
  })

  it('registers the worker inline (no separate registerSW.js outside assets/) and declares a minimum viewport', () => {
    expect(config).toMatch(/injectRegister:\s*'inline'/)
    expect(config).toMatch(/min_viewport_width:\s*360/)
  })
})

describe('form controls are really labelled (console#12)', () => {
  it('NewAppModal: Name and Idea are associated with their labels', () => {
    render(<NewAppModal onClose={vi.fn()} onCreate={vi.fn()} />)
    expect((screen.getByLabelText('Name') as HTMLInputElement).tagName).toBe('INPUT')
    expect(screen.getByLabelText('Idea (optional)').tagName).toBe('TEXTAREA')
  })

  it('RejectModal: the reason textarea is named by its label', () => {
    const submission = { app_id: 'a', name: 'A' } as never
    render(<RejectModal submission={submission} getToken={() => 't'} onClose={vi.fn()} onRejected={vi.fn()} />)
    expect(screen.getByLabelText(/Reason/).tagName).toBe('TEXTAREA')
  })

  it('SubmissionForm: every field has an accessible name', () => {
    render(<SubmissionForm getToken={() => 't'} initial={null} onCancelEdit={vi.fn()} onSubmitted={vi.fn()} onError={vi.fn()} />)
    for (const name of [/App ID/, 'Name', 'Category', 'Description', /Repo URL/, /^Icon \(HTML entity\)/, 'Icon bg']) {
      expect(screen.getByLabelText(name)).toBeTruthy()
    }
  })

  it('icon-only and dynamic-text buttons expose their current visible label as their name', () => {
    render(<NewAppModal onClose={vi.fn()} onCreate={vi.fn()} />)
    const create = screen.getByRole('button', { name: 'Create app' })
    expect(create.getAttribute('aria-label')).toBe(create.textContent) // name never drifts from the visible text
  })
})
