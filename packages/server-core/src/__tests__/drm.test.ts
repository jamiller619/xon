import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  open: vi.fn(),
}));

import { open } from 'node:fs/promises';
import { detectDrm } from '../drm.js';

const mockOpen = vi.mocked(open);

/** Build a minimal mock file handle for a given Buffer. */
function makeFh(buf: Buffer) {
  return {
    read: vi.fn(
      async (
        target: Buffer,
        offset: number,
        length: number,
        position: number,
      ) => {
        const slice = buf.subarray(position, position + length);
        slice.copy(target, offset);
        return { bytesRead: slice.length };
      },
    ),
    stat: vi.fn(async () => ({ size: buf.length })),
    close: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── FairPlay detection ────────────────────────────────────────────────────────

describe('FairPlay detection', () => {
  it('returns false for non-M4V/M4A extensions', async () => {
    expect(await detectDrm('/path/to/file.mp4')).toBe(false);
    expect(await detectDrm('/path/to/file.mp3')).toBe(false);
  });

  it('detects drms box in M4A file', async () => {
    // Build a minimal MP4 with a 'drms' box
    const boxType = Buffer.from('drms', 'ascii');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8, 0); // box size = 8 bytes
    const buf = Buffer.concat([size, boxType]);
    mockOpen.mockResolvedValue(makeFh(buf) as never);

    expect(await detectDrm('/path/to/file.m4a')).toBe(true);
  });

  it('returns false when no drms box present in M4A', async () => {
    // 'moov' box only
    const boxType = Buffer.from('moov', 'ascii');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8, 0);
    const buf = Buffer.concat([size, boxType]);
    mockOpen.mockResolvedValue(makeFh(buf) as never);

    expect(await detectDrm('/path/to/file.m4a')).toBe(false);
  });

  it('returns false when file read fails for M4A', async () => {
    mockOpen.mockRejectedValue(new Error('ENOENT'));
    expect(await detectDrm('/path/to/file.m4a')).toBe(false);
  });

  it('detects drms box in M4V file', async () => {
    const boxType = Buffer.from('drms', 'ascii');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8, 0);
    const buf = Buffer.concat([size, boxType]);
    mockOpen.mockResolvedValue(makeFh(buf) as never);

    expect(await detectDrm('/path/to/movie.m4v')).toBe(true);
  });
});

// ── Widevine detection ────────────────────────────────────────────────────────

describe('Widevine detection', () => {
  it('returns false for non-video extensions', async () => {
    expect(await detectDrm('/path/to/file.mp3')).toBe(false);
    expect(await detectDrm('/path/to/file.epub')).toBe(false);
  });

  it('detects Widevine PSSH box in MP4 file', async () => {
    // Build a buffer containing a PSSH box with the Widevine System ID
    // Layout: size(4) + 'pssh'(4) + version/flags(4) + SystemID(16)
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(32, 0); // size
    buf.write('pssh', 4, 'ascii'); // box type
    buf.writeUInt32BE(0, 8); // version/flags
    // Widevine System ID
    Buffer.from('edef8ba979d64acea3c827dcd51d21ed', 'hex').copy(buf, 12);
    mockOpen.mockResolvedValue(makeFh(buf) as never);

    expect(await detectDrm('/path/to/file.mp4')).toBe(true);
  });

  it('returns false when PSSH has non-Widevine System ID', async () => {
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(32, 0);
    buf.write('pssh', 4, 'ascii');
    buf.writeUInt32BE(0, 8);
    // Random system ID (not Widevine)
    Buffer.from('deadbeefdeadbeefdeadbeefdeadbeef', 'hex').copy(buf, 12);
    mockOpen.mockResolvedValue(makeFh(buf) as never);

    expect(await detectDrm('/path/to/file.mp4')).toBe(false);
  });

  it('returns false when file read fails for MP4', async () => {
    mockOpen.mockRejectedValue(new Error('ENOENT'));
    expect(await detectDrm('/path/to/file.mp4')).toBe(false);
  });
});

// ── Adobe DRM detection ───────────────────────────────────────────────────────

describe('Adobe DRM detection', () => {
  it('returns false for non-EPUB extensions', async () => {
    expect(await detectDrm('/path/to/file.pdf')).toBe(false);
    expect(await detectDrm('/path/to/file.mp4')).toBe(false);
  });

  /** Build a minimal ZIP buffer with one file entry. */
  function buildZip(fileName: string, content: string): Buffer {
    const fileNameBuf = Buffer.from(fileName, 'utf8');
    const contentBuf = Buffer.from(content, 'utf8');

    // Local file header
    const localHeader = Buffer.alloc(30 + fileNameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression (stored)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(0, 14); // crc-32
    localHeader.writeUInt32LE(contentBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(contentBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(fileNameBuf.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28); // extra length
    fileNameBuf.copy(localHeader, 30);

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + fileNameBuf.length);
    cdEntry.writeUInt32LE(0x02014b50, 0); // signature
    cdEntry.writeUInt16LE(20, 4); // version made by
    cdEntry.writeUInt16LE(20, 6); // version needed
    cdEntry.writeUInt16LE(0, 8); // flags
    cdEntry.writeUInt16LE(0, 10); // compression
    cdEntry.writeUInt16LE(0, 12); // mod time
    cdEntry.writeUInt16LE(0, 14); // mod date
    cdEntry.writeUInt32LE(0, 16); // crc-32
    cdEntry.writeUInt32LE(contentBuf.length, 20); // compressed size
    cdEntry.writeUInt32LE(contentBuf.length, 24); // uncompressed size
    cdEntry.writeUInt16LE(fileNameBuf.length, 28); // filename length
    cdEntry.writeUInt16LE(0, 30); // extra length
    cdEntry.writeUInt16LE(0, 32); // comment length
    cdEntry.writeUInt16LE(0, 34); // disk start
    cdEntry.writeUInt16LE(0, 36); // internal attrs
    cdEntry.writeUInt32LE(0, 38); // external attrs
    cdEntry.writeUInt32LE(0, 42); // local header offset
    fileNameBuf.copy(cdEntry, 46);

    const cdOffset = localHeader.length + contentBuf.length;

    // End of central directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // start disk
    eocd.writeUInt16LE(1, 8); // entries on disk
    eocd.writeUInt16LE(1, 10); // total entries
    eocd.writeUInt32LE(cdEntry.length, 12); // cd size
    eocd.writeUInt32LE(cdOffset, 16); // cd offset
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([localHeader, contentBuf, cdEntry, eocd]);
  }

  it('detects Adobe DRM in EPUB with encryption.xml containing ADEPT namespace', async () => {
    const encXml = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
            xmlns:enc="http://www.w3.org/2001/04/xmlenc#"
            xmlns:adept="http://ns.adobe.com/adept">
  <enc:EncryptedData>
    <adept:KeyInfo>dummy</adept:KeyInfo>
  </enc:EncryptedData>
</encryption>`;
    const zip = buildZip('META-INF/encryption.xml', encXml);
    mockOpen.mockResolvedValue(makeFh(zip) as never);

    expect(await detectDrm('/path/to/book.epub')).toBe(true);
  });

  it('returns false for EPUB without encryption.xml', async () => {
    const zip = buildZip('mimetype', 'application/epub+zip');
    mockOpen.mockResolvedValue(makeFh(zip) as never);

    expect(await detectDrm('/path/to/book.epub')).toBe(false);
  });

  it('returns false for EPUB with encryption.xml lacking Adobe namespace', async () => {
    const encXml = `<?xml version="1.0"?>
<encryption xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData/>
</encryption>`;
    const zip = buildZip('META-INF/encryption.xml', encXml);
    mockOpen.mockResolvedValue(makeFh(zip) as never);

    expect(await detectDrm('/path/to/book.epub')).toBe(false);
  });

  it('returns false when file read fails for EPUB', async () => {
    mockOpen.mockRejectedValue(new Error('ENOENT'));
    expect(await detectDrm('/path/to/book.epub')).toBe(false);
  });
});
