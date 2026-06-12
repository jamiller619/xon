import { useQuery } from '@tanstack/react-query'
import { Flex, Surface } from '@xon/ui'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '~/components/logo/Logo'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import CreateLibrary from './CreateLibrary'
import CreateUser from './CreateUser'

export const styles = css`
  .page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }

  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
    padding-block-start: var(--space-6);
  }

  p {
    color: var(--color-gray-10);
  }

  .card {
    width: 100%;
    max-width: 60rem;
    padding: var(--space-6);
    view-transition-name: setup-card;
  }

  .steps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
  }

  .stepDot {
    position: relative;
    top: 4px;
    font-size: var(--font-size-1);
    font-weight: 600;
    padding: var(--space-2) var(--space-6);
    color: var(--color-text-muted);
    text-transform: uppercase;

    &::before {
      content: "";
      position: absolute;
      top: -4px;
      left: 0;
      width: 100%;
      height: 4px;
      background-color: var(--color-gray-7);
      border-radius: 2px; /* Half of height for perfectly round ends */
    }

    &.active {
      color: var(--color-accent-10);
      border-color: var(--color-accent-10);

      &::before {
        background-color: var(--color-accent-10);
        view-transition-name: step-indicator;
      }
    }
  }

  .heading {
    font-weight: 500;
    white-space: nowrap;
    margin-block-end: var(--space-4);
  }

  .form {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-5);
    width: stretch;
  }

  :global {
    ::view-transition-group(setup-card),
    ::view-transition-group(step-indicator) {
      animation-duration: 280ms;
      animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
    }

    @media (prefers-reduced-motion: reduce) {
      ::view-transition-group(*),
      ::view-transition-old(*),
      ::view-transition-new(*) {
        animation: none !important;
      }
    }
  }
`

export default function Setup() {
  const navigate = useNavigate()
  const { data, isPending, error } = useQuery<{
    libraries: boolean
    users: boolean
  }>(useQueryAPIHelper('setupStatus'))

  const step = data?.users ? 2 : 1

  // If we have both libraries and users, setup is complete
  // and we can redirect to the main page
  useEffect(() => {
    if (data?.libraries && data?.users) {
      navigate('/', { replace: true })
    }
  }, [data, navigate])

  return (
    <Flex
      align="center"
      dir="col"
      justify="center"
      gap="6"
      className={styles.page}
    >
      {isPending && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {!isPending && !error && (
        <>
          <header>
            <div className={styles.logo}>
              <Logo />
            </div>
            <Steps step={step} />
          </header>
          <Surface className={styles.card}>
            {step === 1 && <CreateUser styles={styles} />}
            {step === 2 && <CreateLibrary />}
          </Surface>
        </>
      )}
    </Flex>
  )
}

const STEPS = ['1. Account', '2. Library']

function Steps({ step }: { step: number }) {
  return (
    <div className={styles.steps}>
      {STEPS.map((s, index) => (
        <a
          // biome-ignore lint/a11y/useValidAnchor: <explanation>
          href={'#'}
          key={s}
          className={clsx(
            styles.stepDot,
            step === index + 1 && styles.active,
            step > index + 1 && styles.done,
          )}
        >
          {s}
        </a>
      ))}
    </div>
  )
}
