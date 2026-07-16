import { useQuery } from '@tanstack/react-query'
import { Flex, Surface } from '@xon/ui'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
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
    gap: var(--space-xl);
    padding-block-start: var(--space-xl);
  }

  p {
    color: var(--color-gray-10);
  }

  .card {
    width: 100%;
    max-width: 60rem;
    padding: var(--space-xl);
    view-transition-name: setup-card;
  }

  .steps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
  }

  .stepDot {
    position: relative;
    top: 4px;
    font-size: var(--text-xs);
    font-weight: 600;
    padding: var(--space-2xs) var(--space-xl);
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
    margin-block-end: var(--space-md);
  }

  .form {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-lg);
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
  const [step, setStep] = useState(data?.users ? 2 : 1)

  // Wrap the step change in a view transition so the setup-card and
  // step-indicator animate between steps. A plain setState won't trigger
  // one — the browser only captures a transition around a startViewTransition
  // callback, and flushSync forces React to apply the update synchronously
  // inside it.
  const goToStep = useCallback((next: number) => {
    if (!document.startViewTransition) {
      setStep(next)
      return
    }
    document.startViewTransition(() => {
      flushSync(() => setStep(next))
    })
  }, [])

  // If we have both libraries and users, setup is complete
  // and we can redirect to the main page
  useEffect(() => {
    if (data?.libraries && data?.users) {
      navigate('/', { replace: true })
    }
  }, [data, navigate])

  // The step state should be set to 2 if we have users but,
  // in the event that doesn't happen, this effect will
  // correct it
  useEffect(() => {
    if (data?.users) {
      goToStep(2)
    }
  }, [data?.users, goToStep])

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
            {step === 1 && (
              <CreateUser
                styles={styles}
                navigateNextStep={() => goToStep(2)}
              />
            )}
            {step === 2 && <CreateLibrary />}
          </Surface>
        </>
      )}
    </Flex>
  )
}

const STEPS = ['Account', 'Library']

function Steps({ step }: { step: number }) {
  return (
    <div className={styles.steps}>
      {STEPS.map((s, index) => (
        <div
          key={s}
          className={clsx(
            styles.stepDot,
            step === index + 1 && styles.active,
            step > index + 1 && styles.done,
          )}
        >
          {index + 1}.&nbsp;{s}
        </div>
      ))}
    </div>
  )
}
