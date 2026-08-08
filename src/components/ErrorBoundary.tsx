import { Component, type ReactNode } from 'react'

// React unmounts the whole tree on an uncaught render error if nothing
// catches it — this is the only thing standing between a bug in one card
// on one page and a blank white screen for the entire app. It can't fix
// the underlying error, only stop it from taking everything else down;
// "Reload" is a genuine fresh start since persistSession means the login
// itself is untouched by this.
interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
          <p className="font-heading text-lg font-bold text-fg">Something went wrong.</p>
          <p className="max-w-xs text-sm text-muted-fg">
            You're still logged in — this is just a display error. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-1 cursor-pointer rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-navy-fg hover:bg-navy/90"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
