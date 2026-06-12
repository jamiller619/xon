import { Theme } from '@xon/ui'
import { AnimatePresence, motion } from 'motion/react'
import { Suspense } from 'react'
import Router from '~/components/app/Router'
import ErrorBoundary from '~/components/error-boundary/ErrorBoundary'
import ThemeLoader from '~/components/ThemeLoader'

function PageLoader() {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '4rem',
          background: 'var(--color-gray-1',
        }}
      >
        Loading...
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <Theme>
      <ErrorBoundary>
        <ThemeLoader />
        <Suspense fallback={<PageLoader />}>
          <Router />
        </Suspense>
      </ErrorBoundary>
    </Theme>
  )
}
