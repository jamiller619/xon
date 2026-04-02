import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.page ?? ''}>
          <div className={styles.card ?? ''}>
            <div className={styles.code ?? ''}>500</div>
            <h1 className={styles.title ?? ''}>Something went wrong</h1>
            <p className={styles.message ?? ''}>{this.state.error?.message}</p>
            <button
              type="button"
              className={styles.button ?? ''}
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
