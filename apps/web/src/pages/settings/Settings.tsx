import { useCallback, useEffect, useState } from 'react'
import PluginSlot from '../../components/PluginSlot.js'
import { apiFetch } from '../../lib/apiFetch.js'
import { useAppStore } from '../../store/appStore.js'
import { useThemeStore } from '../../store/themeStore.js'
import styles from './Settings.module.css'

interface ThemeInfo {
  id: string
  name: string
  description: string
  active: boolean
  cssUrl?: string
  jsUrl?: string
}

interface UserProfile {
  displayName: string
  email: string
  avatarUrl: string | null
  maxContentRating: string
  hideDrmItems: boolean
}

const CONTENT_RATINGS = ['none', 'G', 'PG', 'PG-13', 'R', 'unrated'] as const
const CONTENT_RATING_LABELS: Record<string, string> = {
  none: 'No restriction',
  G: 'G — General audiences',
  PG: 'PG — Parental guidance suggested',
  'PG-13': 'PG-13 — Parents strongly cautioned',
  R: 'R — Restricted',
  unrated: 'Unrated',
}

export default function Settings() {
  const [themes, setThemes] = useState<ThemeInfo[]>([])
  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme)

  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)

  const [profile, setProfile] = useState<UserProfile>({
    displayName: '',
    email: '',
    avatarUrl: null,
    maxContentRating: 'none',
    hideDrmItems: false,
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)

  const loadProfile = useCallback(() => {
    apiFetch('/api/v1/users/me')
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as UserProfile
        setProfile({
          displayName: d.displayName ?? '',
          email: d.email ?? '',
          avatarUrl: d.avatarUrl ?? null,
          maxContentRating: d.maxContentRating ?? 'none',
          hideDrmItems: d.hideDrmItems ?? false,
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch('/api/v1/themes')
      .then((r) => r.json() as Promise<ThemeInfo[]>)
      .then(setThemes)
      .catch(() => {})
    loadProfile()
  }, [loadProfile])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const res = await apiFetch('/api/v1/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profile.displayName,
          email: profile.email,
          avatarUrl: profile.avatarUrl || null,
          maxContentRating: profile.maxContentRating,
          hideDrmItems: profile.hideDrmItems,
        }),
      })
      if (res.ok) {
        setProfileMsg('Profile saved.')
      } else {
        const body = (await res.json()) as { error?: string }
        setProfileMsg(body.error ?? 'Failed to save profile.')
      }
    } catch {
      setProfileMsg('Failed to save profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setPasswordMsg('New passwords do not match.')
      return
    }
    setPasswordSaving(true)
    setPasswordMsg(null)
    try {
      const res = await apiFetch('/api/v1/users/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setPasswordMsg('Password changed successfully.')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const body = (await res.json()) as { error?: string }
        setPasswordMsg(body.error ?? 'Failed to change password.')
      }
    } catch {
      setPasswordMsg('Failed to change password.')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className={styles.page ?? ''}>
      <h1 className={styles.heading ?? ''}>Settings</h1>

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <section className={styles.section ?? ''}>
        <h2 className={styles.sectionHeading ?? ''}>Profile</h2>
        <form onSubmit={saveProfile} className={styles.form ?? ''}>
          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''} htmlFor="displayName">
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              className={styles.input ?? ''}
              value={profile.displayName}
              onChange={(e) =>
                setProfile((p) => ({ ...p, displayName: e.target.value }))
              }
              required
              maxLength={128}
            />
          </div>

          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={styles.input ?? ''}
              value={profile.email}
              onChange={(e) =>
                setProfile((p) => ({ ...p, email: e.target.value }))
              }
              required
            />
          </div>

          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''} htmlFor="avatarUrl">
              Avatar URL
            </label>
            <input
              id="avatarUrl"
              type="url"
              className={styles.input ?? ''}
              value={profile.avatarUrl ?? ''}
              placeholder="https://example.com/avatar.png"
              onChange={(e) =>
                setProfile((p) => ({ ...p, avatarUrl: e.target.value || null }))
              }
            />
          </div>

          {profileMsg && <p className={styles.formMsg ?? ''}>{profileMsg}</p>}

          <button
            type="submit"
            className={styles.button ?? ''}
            disabled={profileSaving}
          >
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      {/* ── Content preferences ─────────────────────────────────────────────── */}
      <section className={styles.section ?? ''}>
        <h2 className={styles.sectionHeading ?? ''}>Content</h2>

        <div className={styles.fieldGroup ?? ''}>
          <label className={styles.fieldLabel ?? ''} htmlFor="contentRating">
            Maximum content rating
          </label>
          <select
            id="contentRating"
            className={styles.select ?? ''}
            value={profile.maxContentRating}
            onChange={(e) =>
              setProfile((p) => ({ ...p, maxContentRating: e.target.value }))
            }
          >
            {CONTENT_RATINGS.map((r) => (
              <option key={r} value={r}>
                {CONTENT_RATING_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>

        <label className={styles.prefOption ?? ''}>
          <input
            type="checkbox"
            checked={profile.hideDrmItems}
            onChange={(e) =>
              setProfile((p) => ({ ...p, hideDrmItems: e.target.checked }))
            }
          />
          <span className={styles.prefLabel ?? ''}>
            Hide DRM-protected items from library views
          </span>
        </label>

        <div className={styles.saveRow ?? ''}>
          <button
            type="button"
            className={styles.button ?? ''}
            disabled={profileSaving}
            onClick={
              saveProfile as unknown as React.MouseEventHandler<HTMLButtonElement>
            }
          >
            {profileSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </section>

      {/* ── View ────────────────────────────────────────────────────────────── */}
      <section className={styles.section ?? ''}>
        <h2 className={styles.sectionHeading ?? ''}>View</h2>
        <p className={styles.sectionDescription ?? ''}>
          Default layout for library browsing.
        </p>
        <div className={styles.viewOptions ?? ''}>
          <label className={styles.themeOption ?? ''}>
            <input
              type="radio"
              name="viewMode"
              value="grid"
              checked={viewMode === 'grid'}
              onChange={() => setViewMode('grid')}
            />
            <span className={styles.themeName ?? ''}>Grid</span>
            <span className={styles.themeDescription ?? ''}>
              Show items as a grid of cards
            </span>
          </label>
          <label className={styles.themeOption ?? ''}>
            <input
              type="radio"
              name="viewMode"
              value="list"
              checked={viewMode === 'list'}
              onChange={() => setViewMode('list')}
            />
            <span className={styles.themeName ?? ''}>List</span>
            <span className={styles.themeDescription ?? ''}>
              Show items in a compact list
            </span>
          </label>
        </div>
      </section>

      {/* ── Theme ───────────────────────────────────────────────────────────── */}
      <section className={styles.section ?? ''}>
        <h2 className={styles.sectionHeading ?? ''}>Theme</h2>
        <p className={styles.sectionDescription ?? ''}>
          Choose a theme to customize the appearance of the web UI. Only one
          theme can be active at a time.
        </p>

        <div className={styles.themeList ?? ''}>
          <label className={styles.themeOption ?? ''}>
            <input
              type="radio"
              name="theme"
              value=""
              checked={activeThemeId === null}
              onChange={() => setActiveTheme(null)}
            />
            <span className={styles.themeName ?? ''}>Default</span>
            <span className={styles.themeDescription ?? ''}>
              No theme — use built-in styles
            </span>
          </label>

          {themes.map((theme) => (
            <label key={theme.id} className={styles.themeOption ?? ''}>
              <input
                type="radio"
                name="theme"
                value={theme.id}
                checked={activeThemeId === theme.id}
                onChange={() => setActiveTheme(theme.id)}
              />
              <span className={styles.themeName ?? ''}>{theme.name}</span>
              <span className={styles.themeDescription ?? ''}>
                {theme.description}
              </span>
              {!theme.active && (
                <span className={styles.themeInactive ?? ''}>(inactive)</span>
              )}
            </label>
          ))}

          {themes.length === 0 && (
            <p className={styles.noThemes ?? ''}>No theme plugins installed.</p>
          )}
        </div>
      </section>

      {/* ── Security ────────────────────────────────────────────────────────── */}
      <section className={styles.section ?? ''}>
        <h2 className={styles.sectionHeading ?? ''}>Security</h2>
        <form onSubmit={changePassword} className={styles.form ?? ''}>
          <div className={styles.fieldGroup ?? ''}>
            <label
              className={styles.fieldLabel ?? ''}
              htmlFor="currentPassword"
            >
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              className={styles.input ?? ''}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''} htmlFor="newPassword">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              className={styles.input ?? ''}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.fieldGroup ?? ''}>
            <label
              className={styles.fieldLabel ?? ''}
              htmlFor="confirmPassword"
            >
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              className={styles.input ?? ''}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {passwordMsg && <p className={styles.formMsg ?? ''}>{passwordMsg}</p>}

          <button
            type="submit"
            className={styles.button ?? ''}
            disabled={passwordSaving}
          >
            {passwordSaving ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>

      <PluginSlot injectionPoint="settings:page" />
    </div>
  )
}
