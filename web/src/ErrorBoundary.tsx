import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  /** 'page' (default) fills the viewport; 'section' renders a compact in-place
   *  card so one crashing tab/section doesn't take down the whole console. */
  variant?: 'page' | 'section'
  /** When this value changes, a tripped boundary resets — e.g. pass the active
   *  tab so switching tabs clears a stale section error. */
  resetKey?: unknown
}
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.variant === 'section') {
        return (
          <div className="m-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-[var(--ink)]">This section couldn't load</p>
            <p className="text-xs text-[var(--muted)] break-words">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--line-strong)] px-4 py-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)]"
            >
              Try again
            </button>
          </div>
        )
      }
      return (
        <div className="flex min-h-[100dvh] items-center justify-center px-4">
          <div className="text-center max-w-md space-y-4">
            <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Something went wrong</h1>
            <p className="text-sm text-[var(--muted)]">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => { this.setState({ error: null }); window.location.hash = '#/' }}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
