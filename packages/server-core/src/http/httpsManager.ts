import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { join } from 'node:path'
import acme from 'acme-client'

export interface ManualCerts {
  cert: string
  key: string
}

/**
 * Loads a manually configured TLS certificate and key from disk.
 */
export async function loadManualCerts(
  certPath: string,
  keyPath: string,
): Promise<ManualCerts> {
  const [cert, key] = await Promise.all([
    readFile(certPath, 'utf8'),
    readFile(keyPath, 'utf8'),
  ])
  return { cert, key }
}

/**
 * Returns true if the cert file at the given path was last modified within the
 * last 60 days (Let's Encrypt certs expire at 90 days; renew at 60 days).
 */
export async function isCertFileValid(certPath: string): Promise<boolean> {
  try {
    const info = await stat(certPath)
    const ageMs = Date.now() - info.mtimeMs
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000
    return ageMs < sixtyDaysMs
  } catch {
    return false
  }
}

export interface AcmeOptions {
  domain: string
  email: string
  certsDir: string
  /** Port to serve the HTTP-01 challenge on (default 80) */
  challengePort?: number
  /** Use Let's Encrypt staging environment (default false) */
  staging?: boolean
}

export interface AcmeCerts {
  cert: string
  key: string
  certPath: string
  keyPath: string
}

/**
 * Acquires or renews a TLS certificate via Let's Encrypt ACME HTTP-01 challenge.
 *
 * Steps:
 * 1. Ensure certsDir exists
 * 2. If valid cert already exists on disk, return it
 * 3. Otherwise issue a new certificate via ACME
 * 4. Serve HTTP-01 challenge on challengePort (default 80) during issuance
 * 5. Save cert + key to certsDir and return them
 */
export async function acquireAcmeCert(opts: AcmeOptions): Promise<AcmeCerts> {
  const { domain, email, certsDir, challengePort = 80, staging = false } = opts
  await mkdir(certsDir, { recursive: true })

  const certPath = join(certsDir, `${domain}.crt`)
  const keyPath = join(certsDir, `${domain}.key`)

  // Return existing cert if still valid (< 60 days old)
  if (await isCertFileValid(certPath)) {
    const [cert, key] = await Promise.all([
      readFile(certPath, 'utf8'),
      readFile(keyPath, 'utf8'),
    ])
    return { cert, key, certPath, keyPath }
  }

  // Generate account key for ACME registration
  const accountKey = await acme.crypto.createPrivateKey()

  const client = new acme.Client({
    directoryUrl: staging
      ? acme.directory.letsencrypt.staging
      : acme.directory.letsencrypt.production,
    accountKey,
  })

  // Generate domain key and CSR
  const [domainKey, csr] = await acme.crypto.createCsr({ commonName: domain })

  // Map of challenge token → key authorisation content
  const challengeTokens = new Map<string, string>()

  // Temporary HTTP server to answer HTTP-01 challenges
  const challengeServer = createHttpServer((req, res) => {
    const prefix = '/.well-known/acme-challenge/'
    if (req.url?.startsWith(prefix)) {
      const token = req.url.slice(prefix.length)
      const content = challengeTokens.get(token ?? '')
      if (content) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(content)
        return
      }
    }
    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve, reject) => {
    challengeServer.listen(challengePort, (err?: Error) => {
      if (err) reject(err)
      else resolve()
    })
  })

  let certPem: string

  try {
    certPem = await client.auto({
      csr,
      email,
      termsOfServiceAgreed: true,
      challengePriority: ['http-01'],
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        challengeTokens.set(challenge.token, keyAuthorization)
      },
      challengeRemoveFn: async (_authz, challenge) => {
        challengeTokens.delete(challenge.token)
      },
    })
  } finally {
    await new Promise<void>((resolve) => challengeServer.close(() => resolve()))
  }

  const keyPem = domainKey.toString()

  await Promise.all([
    writeFile(certPath, certPem, { mode: 0o600 }),
    writeFile(keyPath, keyPem, { mode: 0o600 }),
  ])

  return { cert: certPem, key: keyPem, certPath, keyPath }
}
