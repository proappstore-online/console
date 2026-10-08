import { describe, expect, it } from 'vitest'
import { codeHealthLoadError } from './CodeHealth'

// platform#350: a missing or private report is explained, not shown as a bare status.
describe('codeHealthLoadError', () => {
  it('explains a missing report and a private app, and keeps other statuses', () => {
    expect(codeHealthLoadError(404)).toContain('No Code Health report for this app yet')
    expect(codeHealthLoadError(403)).toContain('This app is private')
    expect(codeHealthLoadError(401)).toContain('This app is private')
    expect(codeHealthLoadError(500)).toBe('HTTP 500')
  })
})
