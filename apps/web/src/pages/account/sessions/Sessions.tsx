import {
  Desktop20Regular,
  Phone20Regular,
  QuestionCircle20Regular,
  DismissCircle16Regular as RevokeSessionIcon,
  Tablet20Regular,
} from '@fluentui/react-icons'
import { Button, ConfirmationDialog, Skeleton, Surface } from '@xon/ui'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import {
  type ClientSession,
  useRevokeSession,
  useSessions,
} from '~/hooks/useSessions'
import authClient from '~/lib/authClient'
import Page from '~/pages/Page'
import styles from './Sessions.module.css'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const durationFormatter = new Intl.DurationFormat(undefined, {
  style: 'narrow',
})

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : dateFormatter.format(date)
}

function formatTimeAgo(value: string, now: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - date.getTime()) / 60_000),
  )
  if (elapsedMinutes === 0) return 'Just now'

  const days = Math.floor(elapsedMinutes / (24 * 60))
  const hours = Math.floor((elapsedMinutes % (24 * 60)) / 60)
  const minutes = elapsedMinutes % 60

  const duration =
    days > 0 ? { days, hours } : hours > 0 ? { hours, minutes } : { minutes }

  return `${durationFormatter.format(duration)} ago`
}

function DeviceIcon({ type }: { type: ClientSession['device']['type'] }) {
  if (type === 'mobile') return <Phone20Regular aria-hidden="true" />
  if (type === 'tablet') return <Tablet20Regular aria-hidden="true" />
  if (type === 'desktop') return <Desktop20Regular aria-hidden="true" />
  return <QuestionCircle20Regular aria-hidden="true" />
}

function SessionSkeleton() {
  return (
    <div
      className={styles.skeletons}
      aria-label="Loading sessions"
      role="status"
    >
      {[0, 1, 2].map((key) => (
        <Surface className={styles.skeletonRow} key={key}>
          <Skeleton className={styles.skeletonIcon} />
          <div className={styles.skeletonBody}>
            <Skeleton className={styles.skeletonTitle} />
            <Skeleton className={styles.skeletonMeta} />
          </div>
        </Surface>
      ))}
    </div>
  )
}

function SessionRow({
  session,
  now,
  onRevoke,
}: {
  session: ClientSession
  now: number
  onRevoke: (session: ClientSession) => void
}) {
  const displayName = session.clientName ?? session.device.label

  return (
    <Surface
      as="li"
      className={clsx(
        styles.sessionRow,
        session.isCurrent && styles.currentSession,
      )}
    >
      <div className={styles.deviceIcon}>
        <DeviceIcon type={session.device.type} />
      </div>

      <div className={styles.sessionContent}>
        <div className={styles.deviceHeading}>
          <h2>{displayName}</h2>
          {session.isCurrent && (
            <span className={styles.currentBadge}>Current session</span>
          )}
        </div>
        {session.clientName && (
          <p className={styles.deviceDetails}>{session.device.label}</p>
        )}

        <dl className={styles.facts}>
          <div>
            <dt>IP address</dt>
            <dd>{session.ipAddress || 'IP unavailable'}</dd>
          </div>
          <div>
            <dt>Last active</dt>
            <dd>
              <time className={styles.lastActive} dateTime={session.lastSeenAt}>
                <span>{formatTimeAgo(session.lastSeenAt, now)}</span>
                <span className={styles.lastActiveDate}>
                  {formatDate(session.lastSeenAt)}
                </span>
              </time>
            </dd>
          </div>
          <div>
            <dt>Signed in</dt>
            <dd>
              <time dateTime={session.createdAt}>
                {formatDate(session.createdAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>
              <time dateTime={session.expiresAt}>
                {formatDate(session.expiresAt)}
              </time>
            </dd>
          </div>
        </dl>
      </div>

      {!session.isCurrent && (
        <Button
          aria-label={`Revoke ${displayName}${
            session.ipAddress ? ` at ${session.ipAddress}` : ''
          }`}
          className={styles.revokeButton}
          onClick={() => onRevoke(session)}
        >
          <RevokeSessionIcon aria-hidden="true" />
          Revoke session
        </Button>
      )}
    </Surface>
  )
}

export default function Sessions() {
  const { data: authData } = authClient.useSession()
  const userId = authData?.user.id
  const sessionsQuery = useSessions(userId)
  const revokeSession = useRevokeSession(userId)
  const [selectedSession, setSelectedSession] = useState<ClientSession>()
  const [liveStatus, setLiveStatus] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const confirmationDescription = useMemo(() => {
    if (!selectedSession) return undefined
    const displayName =
      selectedSession.clientName ?? selectedSession.device.label
    const location = selectedSession.ipAddress
      ? ` at ${selectedSession.ipAddress}`
      : ''
    return (
      <>
        Revoke {displayName}
        {location}? That client will need to sign in again.
        {revokeSession.error && (
          <span className={styles.dialogError} role="alert">
            {revokeSession.error.message}
          </span>
        )}
      </>
    )
  }, [revokeSession.error, selectedSession])

  function askToRevoke(session: ClientSession) {
    revokeSession.reset()
    setSelectedSession(session)
  }

  function confirmRevoke() {
    if (!selectedSession || selectedSession.isCurrent) return
    const label = selectedSession.clientName ?? selectedSession.device.label
    revokeSession.mutate(selectedSession.id, {
      onSuccess: () => {
        setSelectedSession(undefined)
        setLiveStatus(`${label} was revoked.`)
      },
    })
  }

  return (
    <Page>
      <header>
        <Page.Title>Sessions</Page.Title>
        <Page.Subtitle>
          Clients currently signed in to your account. Last-active times can
          take up to five minutes to update.
        </Page.Subtitle>
      </header>

      <p className={styles.visuallyHidden} aria-live="polite" role="status">
        {liveStatus}
      </p>

      {sessionsQuery.isPending ? (
        <SessionSkeleton />
      ) : sessionsQuery.error ? (
        <Surface className={styles.message} role="alert">
          <h2>Sessions could not be loaded</h2>
          <p>{sessionsQuery.error.message}</p>
          <Button onClick={() => void sessionsQuery.refetch()}>Retry</Button>
        </Surface>
      ) : sessionsQuery.data.length === 0 ? (
        <Surface className={styles.message}>
          <h2>No active sessions</h2>
          <p>No signed-in clients are currently available.</p>
        </Surface>
      ) : (
        <ul className={styles.sessionList}>
          {sessionsQuery.data.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              now={now}
              onRevoke={askToRevoke}
            />
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={selectedSession !== undefined}
        title="Revoke session?"
        description={confirmationDescription}
        yesLabel="Revoke session"
        noLabel="Cancel"
        loading={revokeSession.isPending}
        onYes={confirmRevoke}
        onNo={() => {
          if (!revokeSession.isPending) setSelectedSession(undefined)
        }}
      />
    </Page>
  )
}
