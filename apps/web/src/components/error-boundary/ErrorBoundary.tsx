import { Button, Flex } from '@xon/ui'
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

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary caught:', error, info.componentStack)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Flex align="center" dir="col" gap="3" className={styles.page}>
          <div className={styles.code}>500</div>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.message}>{this.state.error?.message}</p>
          <Button
            variant="primary"
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
          >
            Retry
          </Button>
        </Flex>
      )
    }

    return this.props.children
  }
}
