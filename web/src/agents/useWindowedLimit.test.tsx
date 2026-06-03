// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWindowedLimit } from './useWindowedLimit'

describe('useWindowedLimit', () => {
  it('starts at the step size', () => {
    const { result } = renderHook(() => useWindowedLimit(20))
    expect(result.current.limit).toBe(20)
  })

  it('more() reveals another step', () => {
    const { result } = renderHook(() => useWindowedLimit(20))
    act(() => result.current.more())
    expect(result.current.limit).toBe(40)
    act(() => { result.current.more(); result.current.more() })
    expect(result.current.limit).toBe(80)
  })

  it('reset() snaps back to the first window', () => {
    const { result } = renderHook(() => useWindowedLimit(50))
    act(() => { result.current.more(); result.current.more() })
    expect(result.current.limit).toBe(150)
    act(() => result.current.reset())
    expect(result.current.limit).toBe(50)
  })
})
