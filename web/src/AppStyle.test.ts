import { describe, expect, it } from 'vitest'
import { DEFAULTS, generateCss } from './AppStyle'

// The Style tab writes a design-token stylesheet into a *creator's* app. These
// snapshots pin that output byte for byte, so the generator can be restructured
// (compliance: this console's own source must not redefine template tokens)
// without changing what creators receive.
describe('generateCss', () => {
  it('matches the snapshot for the default tokens', () => {
    expect(generateCss(DEFAULTS)).toMatchSnapshot()
  })

  it('matches the snapshot for a custom palette and radius', () => {
    expect(generateCss({
      ...DEFAULTS, accent: '#ff5500', accentHover: '#cc4400',
      paper: '#fafaf5', paperDark: '#101018', ink: '#222222', inkDark: '#dddddd',
      fontBody: 'Inter', fontDisplay: 'Playfair Display', radius: '24px',
    })).toMatchSnapshot()
  })

  it('falls back to the default accent tint for a non-hex accent', () => {
    expect(generateCss({ ...DEFAULTS, accent: 'rebeccapurple' })).toContain('--accent-soft: rgba(124,58,237,0.08);')
  })
})
