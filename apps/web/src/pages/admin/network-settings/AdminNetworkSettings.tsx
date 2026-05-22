import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import styles from './AdminNetworkSettings.module.css'

interface NetworkSettingsData {
  httpsEnabled: boolean
  httpsCertPath: string | null
  httpsKeyPath: string | null
  acmeEnabled: boolean
  acmeDomain: string | null
  acmeEmail: string | null
  acmeCertsDir: string | null
  trustProxy: boolean
}

const DEFAULT_SETTINGS: NetworkSettingsData = {
  httpsEnabled: false,
  httpsCertPath: null,
  httpsKeyPath: null,
  acmeEnabled: false,
  acmeDomain: null,
  acmeEmail: null,
  acmeCertsDir: null,
  trustProxy: false,
}

export default function AdminNetworkSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [httpsEnabled, setHttpsEnabled] = useState(false)
  const [httpsCertPath, setHttpsCertPath] = useState('')
  const [httpsKeyPath, setHttpsKeyPath] = useState('')
  const [acmeEnabled, setAcmeEnabled] = useState(false)
  const [acmeDomain, setAcmeDomain] = useState('')
  const [acmeEmail, setAcmeEmail] = useState('')
  const [acmeCertsDir, setAcmeCertsDir] = useState('')
  const [trustProxy, setTrustProxy] = useState(false)

  const applySettings = useCallback((data: NetworkSettingsData) => {
    setHttpsEnabled(data.httpsEnabled)
    setHttpsCertPath(data.httpsCertPath ?? '')
    setHttpsKeyPath(data.httpsKeyPath ?? '')
    setAcmeEnabled(data.acmeEnabled)
    setAcmeDomain(data.acmeDomain ?? '')
    setAcmeEmail(data.acmeEmail ?? '')
    setAcmeCertsDir(data.acmeCertsDir ?? '')
    setTrustProxy(data.trustProxy)
  }, [])

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/admin/server-settings')
      .then((r) => r.json() as Promise<NetworkSettingsData>)
      .then((data) => {
        applySettings(data)
      })
      .catch(() => setError('Failed to load network settings'))
      .finally(() => setLoading(false))
  }, [applySettings])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const body: Record<string, unknown> = {
      httpsEnabled,
      httpsCertPath: httpsCertPath || null,
      httpsKeyPath: httpsKeyPath || null,
      acmeEnabled,
      acmeDomain: acmeDomain || null,
      acmeEmail: acmeEmail || null,
      acmeCertsDir: acmeCertsDir || null,
      trustProxy,
    }

    try {
      const res = await apiFetch('/api/admin/server-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        setError(errBody.error ?? 'Failed to save settings')
      } else {
        const data = (await res.json()) as NetworkSettingsData
        applySettings(data)
        setSuccess('Settings saved. Restart the server to apply HTTPS changes.')
        setTimeout(() => setSuccess(''), 5000)
      }
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page ?? ''}>
        <p className={styles.loading ?? ''}>Loading...</p>
      </div>
    )
  }

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.header ?? ''}>
        <h1 className={styles.heading ?? ''}>Network &amp; Security</h1>
      </div>

      <form onSubmit={handleSave}>
        {/* HTTPS section */}
        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>HTTPS</h2>
          <label className={styles.toggle ?? ''}>
            <input
              type="checkbox"
              checked={httpsEnabled}
              onChange={(e) => setHttpsEnabled(e.target.checked)}
            />
            <span>Enable HTTPS</span>
          </label>

          {httpsEnabled && (
            <div className={styles.subsection ?? ''}>
              {/* Manual certificate */}
              <h3 className={styles.subHeading ?? ''}>Manual Certificate</h3>
              <p className={styles.hint ?? ''}>
                Provide paths to your own TLS certificate and private key (PEM
                format).
              </p>
              <div className={styles.fieldGroup ?? ''}>
                <label className={styles.fieldLabel ?? ''}>
                  Certificate file path
                  <input
                    type="text"
                    className={`${styles.input ?? ''} ${acmeEnabled ? (styles.disabled ?? '') : ''}`}
                    value={httpsCertPath}
                    onChange={(e) => setHttpsCertPath(e.target.value)}
                    placeholder="/etc/ssl/cert.pem"
                    disabled={acmeEnabled}
                  />
                </label>
                <label className={styles.fieldLabel ?? ''}>
                  Private key file path
                  <input
                    type="text"
                    className={`${styles.input ?? ''} ${acmeEnabled ? (styles.disabled ?? '') : ''}`}
                    value={httpsKeyPath}
                    onChange={(e) => setHttpsKeyPath(e.target.value)}
                    placeholder="/etc/ssl/key.pem"
                    disabled={acmeEnabled}
                  />
                </label>
              </div>

              {/* ACME / Let's Encrypt */}
              <h3 className={styles.subHeading ?? ''}>
                Let&apos;s Encrypt (ACME)
              </h3>
              <p className={styles.hint ?? ''}>
                Automatically obtain and renew a free TLS certificate from
                Let&apos;s Encrypt. Requires the server to be accessible on port
                80 from the internet.
              </p>
              <label className={styles.toggle ?? ''}>
                <input
                  type="checkbox"
                  checked={acmeEnabled}
                  onChange={(e) => setAcmeEnabled(e.target.checked)}
                />
                <span>Enable automatic HTTPS via Let&apos;s Encrypt</span>
              </label>

              {acmeEnabled && (
                <div className={styles.fieldGroup ?? ''}>
                  <label className={styles.fieldLabel ?? ''}>
                    Domain name
                    <input
                      type="text"
                      className={styles.input ?? ''}
                      value={acmeDomain}
                      onChange={(e) => setAcmeDomain(e.target.value)}
                      placeholder="media.example.com"
                      required
                    />
                  </label>
                  <label className={styles.fieldLabel ?? ''}>
                    Email address
                    <input
                      type="email"
                      className={styles.input ?? ''}
                      value={acmeEmail}
                      onChange={(e) => setAcmeEmail(e.target.value)}
                      placeholder="admin@example.com"
                      required
                    />
                  </label>
                  <label className={styles.fieldLabel ?? ''}>
                    Certificate storage directory
                    <input
                      type="text"
                      className={styles.input ?? ''}
                      value={acmeCertsDir}
                      onChange={(e) => setAcmeCertsDir(e.target.value)}
                      placeholder="./certs"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Reverse proxy section */}
        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>Reverse Proxy</h2>
          <p className={styles.hint ?? ''}>
            Enable this if Xon runs behind a reverse proxy (nginx, Caddy,
            Traefik, etc.). When enabled, the real client IP is read from{' '}
            <code className={styles.code ?? ''}>X-Forwarded-For</code> and the
            protocol from{' '}
            <code className={styles.code ?? ''}>X-Forwarded-Proto</code>.
          </p>
          <label className={styles.toggle ?? ''}>
            <input
              type="checkbox"
              checked={trustProxy}
              onChange={(e) => setTrustProxy(e.target.checked)}
            />
            <span>Trust reverse proxy headers</span>
          </label>
        </section>

        {error && <p className={styles.error ?? ''}>{error}</p>}
        {success && <p className={styles.success ?? ''}>{success}</p>}

        <div className={styles.actions ?? ''}>
          <button
            type="submit"
            className={styles.saveBtn ?? ''}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

export { DEFAULT_SETTINGS }
