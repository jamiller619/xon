import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:http', () => ({
  createServer: vi.fn(),
}));

vi.mock('acme-client', () => {
  const clientAuto = vi.fn();
  const Client = vi.fn().mockImplementation(() => ({ auto: clientAuto }));
  return {
    default: {
      Client,
      directory: {
        letsencrypt: {
          staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
          production: 'https://acme-v02.api.letsencrypt.org/directory',
        },
      },
      crypto: {
        createPrivateKey: vi.fn().mockResolvedValue(Buffer.from('account-key')),
        createCsr: vi
          .fn()
          .mockResolvedValue([
            Buffer.from('domain-key'),
            Buffer.from('csr-data'),
          ]),
      },
    },
  };
});

import { readFile, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import acme from 'acme-client';
import {
  acquireAcmeCert,
  isCertFileValid,
  loadManualCerts,
} from '../httpsManager.js';

const mReadFile = vi.mocked(readFile);
const mStat = vi.mocked(stat);
const mWriteFile = vi.mocked(writeFile);
const mCreateServer = vi.mocked(createHttpServer);
const mAcmeClient = vi.mocked(acme.Client);

describe('loadManualCerts', () => {
  it('reads cert and key from disk', async () => {
    mReadFile
      .mockResolvedValueOnce('CERT_CONTENT' as never)
      .mockResolvedValueOnce('KEY_CONTENT' as never);

    const result = await loadManualCerts(
      '/path/to/cert.pem',
      '/path/to/key.pem',
    );
    expect(result.cert).toBe('CERT_CONTENT');
    expect(result.key).toBe('KEY_CONTENT');
  });

  it('propagates read errors', async () => {
    mReadFile.mockRejectedValueOnce(new Error('ENOENT') as never);
    await expect(loadManualCerts('/no/cert', '/no/key')).rejects.toThrow(
      'ENOENT',
    );
  });
});

describe('isCertFileValid', () => {
  it('returns true when cert file is less than 60 days old', async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mStat.mockResolvedValueOnce({ mtimeMs: oneDayAgo.getTime() } as never);
    expect(await isCertFileValid('/path/cert.crt')).toBe(true);
  });

  it('returns false when cert file is older than 60 days', async () => {
    const seventyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000);
    mStat.mockResolvedValueOnce({ mtimeMs: seventyDaysAgo.getTime() } as never);
    expect(await isCertFileValid('/path/cert.crt')).toBe(false);
  });

  it('returns false when file does not exist', async () => {
    mStat.mockRejectedValueOnce(new Error('ENOENT') as never);
    expect(await isCertFileValid('/no/cert.crt')).toBe(false);
  });
});

describe('acquireAcmeCert', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: mock a fake HTTP challenge server
    const fakeServer = {
      listen: vi.fn((_port: number, cb: (err?: Error) => void) => cb()),
      close: vi.fn((cb: () => void) => cb()),
    };
    mCreateServer.mockReturnValue(fakeServer as never);

    // Default: no existing cert (stat rejects)
    mStat.mockRejectedValue(new Error('ENOENT') as never);

    // Default: acme client returns a cert
    const mockAuto = vi.fn().mockResolvedValue('CERT_PEM');
    mAcmeClient.mockImplementation(() => ({ auto: mockAuto }) as never);
    vi.mocked(acme.crypto.createPrivateKey).mockResolvedValue(
      Buffer.from('acct-key') as never,
    );
    vi.mocked(acme.crypto.createCsr).mockResolvedValue([
      Buffer.from('domain-key'),
      Buffer.from('csr'),
    ] as never);
  });

  it('issues a new certificate when none exists on disk', async () => {
    const result = await acquireAcmeCert({
      domain: 'example.com',
      email: 'admin@example.com',
      certsDir: '/certs',
    });

    expect(result.cert).toBe('CERT_PEM');
    expect(result.key).toBe('domain-key');
    expect(result.certPath).toBe('/certs/example.com.crt');
    expect(result.keyPath).toBe('/certs/example.com.key');
    expect(mWriteFile).toHaveBeenCalledTimes(2);
  });

  it('returns existing cert when file is still valid (< 60 days old)', async () => {
    const recentTime = Date.now() - 1000;
    mStat.mockResolvedValue({ mtimeMs: recentTime } as never);
    mReadFile
      .mockResolvedValueOnce('EXISTING_CERT' as never)
      .mockResolvedValueOnce('EXISTING_KEY' as never);

    const result = await acquireAcmeCert({
      domain: 'example.com',
      email: 'admin@example.com',
      certsDir: '/certs',
    });

    expect(result.cert).toBe('EXISTING_CERT');
    expect(result.key).toBe('EXISTING_KEY');
    // No new cert issued
    expect(mAcmeClient).not.toHaveBeenCalled();
  });

  it('uses staging URL when staging=true', async () => {
    await acquireAcmeCert({
      domain: 'example.com',
      email: 'admin@example.com',
      certsDir: '/certs',
      staging: true,
    });

    expect(mAcmeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        directoryUrl: acme.directory.letsencrypt.staging,
      }),
    );
  });

  it('uses production URL by default', async () => {
    await acquireAcmeCert({
      domain: 'example.com',
      email: 'admin@example.com',
      certsDir: '/certs',
    });

    expect(mAcmeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        directoryUrl: acme.directory.letsencrypt.production,
      }),
    );
  });

  it('serves HTTP-01 challenge via temporary server on specified port', async () => {
    const fakeServer = {
      listen: vi.fn((_port: number, cb: (err?: Error) => void) => cb()),
      close: vi.fn((cb: () => void) => cb()),
    };
    mCreateServer.mockReturnValue(fakeServer as never);

    await acquireAcmeCert({
      domain: 'example.com',
      email: 'admin@example.com',
      certsDir: '/certs',
      challengePort: 8080,
    });

    expect(fakeServer.listen).toHaveBeenCalledWith(8080, expect.any(Function));
    expect(fakeServer.close).toHaveBeenCalled();
  });
});
