import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { MediaCategory } from '@xon/shared';
import {
  type ArchiveMetadata,
  type DocumentMetadata,
  type FontMetadata,
  type Model3DMetadata,
  extract3DModelMetadata,
  extractArchiveMetadata,
  extractDocumentMetadata,
  extractFontMetadata,
  is3DModelCategory,
  isArchiveCategory,
  isDocumentCategory,
  isFontCategory,
} from './miscmeta.js';

type FakeChildProcess = EventEmitter & { stdout: EventEmitter };

function makeProcess(): FakeChildProcess {
  const proc = new EventEmitter() as FakeChildProcess;
  proc.stdout = new EventEmitter();
  return proc;
}

const mockSpawn = vi.mocked(spawn);
const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Category helpers ──────────────────────────────────────────────────────────

describe('isDocumentCategory', () => {
  it('returns true for Documents', () => {
    expect(isDocumentCategory(MediaCategory.Documents)).toBe(true);
  });
  it('returns false for other categories', () => {
    expect(isDocumentCategory(MediaCategory.Music)).toBe(false);
    expect(isDocumentCategory(MediaCategory.Movies)).toBe(false);
    expect(isDocumentCategory(null)).toBe(false);
  });
});

describe('isFontCategory', () => {
  it('returns true for Fonts', () => {
    expect(isFontCategory(MediaCategory.Fonts)).toBe(true);
  });
  it('returns false for other categories', () => {
    expect(isFontCategory(MediaCategory.Documents)).toBe(false);
    expect(isFontCategory(null)).toBe(false);
  });
});

describe('is3DModelCategory', () => {
  it('returns true for Models3D', () => {
    expect(is3DModelCategory(MediaCategory.Models3D)).toBe(true);
  });
  it('returns false for other categories', () => {
    expect(is3DModelCategory(MediaCategory.Archives)).toBe(false);
    expect(is3DModelCategory(null)).toBe(false);
  });
});

describe('isArchiveCategory', () => {
  it('returns true for Archives', () => {
    expect(isArchiveCategory(MediaCategory.Archives)).toBe(true);
  });
  it('returns false for other categories', () => {
    expect(isArchiveCategory(MediaCategory.Documents)).toBe(false);
    expect(isArchiveCategory(null)).toBe(false);
  });
});

// ── Document metadata ─────────────────────────────────────────────────────────

describe('extractDocumentMetadata', () => {
  it('extracts page count, author, and title from PDF exiftool output', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const output = JSON.stringify([
      { PageCount: 42, Author: 'Jane Doe', Title: 'My Document' },
    ]);

    const promise = extractDocumentMetadata('/docs/report.pdf');
    proc.stdout.emit('data', Buffer.from(output));
    proc.emit('close', 0);

    const result = await promise;
    expect(result).toEqual<DocumentMetadata>({
      pageCount: 42,
      author: 'Jane Doe',
      title: 'My Document',
    });
  });

  it('returns partial metadata when some fields are missing', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const output = JSON.stringify([{ PageCount: 10 }]);
    const promise = extractDocumentMetadata('/docs/noauthor.pdf');
    proc.stdout.emit('data', Buffer.from(output));
    proc.emit('close', 0);

    const result = await promise;
    expect(result?.pageCount).toBe(10);
    expect(result?.author).toBeUndefined();
    expect(result?.title).toBeUndefined();
  });

  it('returns null when exiftool is not available', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const promise = extractDocumentMetadata('/docs/file.pdf');
    proc.emit('error', new Error('spawn exiftool ENOENT'));

    expect(await promise).toBeNull();
  });

  it('returns null when exiftool exits with non-zero code', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const promise = extractDocumentMetadata('/docs/corrupt.pdf');
    proc.emit('close', 1);

    expect(await promise).toBeNull();
  });

  it('returns empty object when exiftool output has no entries', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const promise = extractDocumentMetadata('/docs/empty.pdf');
    proc.stdout.emit('data', Buffer.from(JSON.stringify([])));
    proc.emit('close', 0);

    expect(await promise).toEqual({});
  });
});

// ── Font metadata ─────────────────────────────────────────────────────────────

describe('extractFontMetadata', () => {
  it('extracts font family, weight, style, and glyph count', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const output = JSON.stringify([
      {
        FamilyName: 'Inter',
        FontSubfamily: 'Bold Italic',
        NumGlyphs: 2048,
      },
    ]);

    const promise = extractFontMetadata('/fonts/inter-bold-italic.ttf');
    proc.stdout.emit('data', Buffer.from(output));
    proc.emit('close', 0);

    const result = await promise;
    expect(result).toEqual<FontMetadata>({
      fontFamily: 'Inter',
      fontWeight: 'Bold',
      fontStyle: 'Italic',
      glyphCount: 2048,
    });
  });

  it('maps Regular subfamily to Regular weight and Normal style', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const output = JSON.stringify([
      { FamilyName: 'Roboto', FontSubfamily: 'Regular' },
    ]);
    const promise = extractFontMetadata('/fonts/roboto.otf');
    proc.stdout.emit('data', Buffer.from(output));
    proc.emit('close', 0);

    const result = await promise;
    expect(result?.fontWeight).toBe('Regular');
    expect(result?.fontStyle).toBe('Normal');
  });

  it('uses FontName fallback when FamilyName is absent', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const output = JSON.stringify([
      { FontName: 'OpenSans', FontSubfamily: 'Light' },
    ]);
    const promise = extractFontMetadata('/fonts/opensans.ttf');
    proc.stdout.emit('data', Buffer.from(output));
    proc.emit('close', 0);

    const result = await promise;
    expect(result?.fontFamily).toBe('OpenSans');
    expect(result?.fontWeight).toBe('Light');
  });

  it('returns null when exiftool is not available', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const promise = extractFontMetadata('/fonts/font.ttf');
    proc.emit('error', new Error('spawn exiftool ENOENT'));

    expect(await promise).toBeNull();
  });
});

// ── 3D Model metadata ─────────────────────────────────────────────────────────

describe('extract3DModelMetadata', () => {
  it('counts vertices and faces from an OBJ file', async () => {
    const objContent =
      '# A simple cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nf 1 2 3\nf 1 3 4\n';
    mockReadFile.mockResolvedValue(objContent as never);

    const result = await extract3DModelMetadata('/models/cube.obj');
    expect(result).toEqual<Model3DMetadata>({ vertexCount: 4, faceCount: 2 });
  });

  it('extracts vertex and face counts from a glTF file', async () => {
    const gltf = {
      accessors: [
        { count: 24, type: 'VEC3' }, // POSITION — index 0
        { count: 36, type: 'SCALAR' }, // indices — index 1
      ],
      meshes: [
        {
          primitives: [{ attributes: { POSITION: 0 }, indices: 1 }],
        },
      ],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(gltf) as never);

    const result = await extract3DModelMetadata('/models/box.gltf');
    expect(result).toEqual<Model3DMetadata>({ vertexCount: 24, faceCount: 12 }); // 36/3 = 12 faces
  });

  it('returns empty object for unsupported 3D formats', async () => {
    const result = await extract3DModelMetadata('/models/mesh.fbx');
    expect(result).toEqual({});
  });

  it('returns null when file read fails', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never);

    const result = await extract3DModelMetadata('/models/missing.obj');
    expect(result).toBeNull();
  });

  it('returns empty object for glTF with no meshes', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ asset: { version: '2.0' } }) as never,
    );

    const result = await extract3DModelMetadata('/models/empty.gltf');
    expect(result).toEqual({});
  });
});

// ── Archive metadata ──────────────────────────────────────────────────────────

/**
 * Builds a minimal valid ZIP buffer for testing.
 * Uses STORE compression (no compression), fake CRC.
 */
function makeZipBuffer(files: Array<{ name: string; size: number }>): Buffer {
  const localHeaders: Buffer[] = [];
  const cdEntries: Buffer[] = [];
  const offsets: number[] = [];
  let localOffset = 0;

  for (const f of files) {
    const nameBytes = Buffer.from(f.name, 'utf8');
    offsets.push(localOffset);

    // Local file header (30 bytes fixed + filename)
    const lh = Buffer.alloc(30 + nameBytes.length);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(0, 8); // compression: STORE
    lh.writeUInt16LE(0, 10); // mod time
    lh.writeUInt16LE(0, 12); // mod date
    lh.writeUInt32LE(0, 14); // crc (fake)
    lh.writeUInt32LE(f.size, 18); // compressed size
    lh.writeUInt32LE(f.size, 22); // uncompressed size
    lh.writeUInt16LE(nameBytes.length, 26); // filename length
    lh.writeUInt16LE(0, 28); // extra length
    nameBytes.copy(lh, 30);

    localHeaders.push(lh);
    localHeaders.push(Buffer.alloc(f.size)); // fake file data
    localOffset += 30 + nameBytes.length + f.size;
  }

  let cdSize = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i] ?? { name: '', size: 0 };
    const nameBytes = Buffer.from(f.name, 'utf8');
    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0); // CD signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // compression
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(0, 16); // crc
    cd.writeUInt32LE(f.size, 20); // compressed size
    cd.writeUInt32LE(f.size, 24); // uncompressed size
    cd.writeUInt16LE(nameBytes.length, 28); // filename length
    cd.writeUInt16LE(0, 30); // extra length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk start
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offsets[i] ?? 0, 42); // local header offset
    nameBytes.copy(cd, 46);

    cdEntries.push(cd);
    cdSize += cd.length;
  }

  // End of Central Directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // entries on disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12); // CD size
  eocd.writeUInt32LE(localOffset, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...cdEntries, eocd]);
}

/**
 * Builds a minimal valid uncompressed TAR buffer for testing.
 */
function makeTarBuffer(files: Array<{ name: string; size: number }>): Buffer {
  const blocks: Buffer[] = [];

  for (const f of files) {
    const header = Buffer.alloc(512);
    Buffer.from(f.name).copy(header, 0); // filename
    const sizeOctal = `${f.size.toString(8).padStart(11, '0')}\0`;
    Buffer.from(sizeOctal).copy(header, 124); // size in octal
    header[156] = 0x30; // typeflag: '0' = regular file

    blocks.push(header);
    blocks.push(Buffer.alloc(Math.ceil(f.size / 512) * 512)); // data blocks
  }

  blocks.push(Buffer.alloc(1024)); // end-of-archive: two zero blocks
  return Buffer.concat(blocks);
}

describe('extractArchiveMetadata', () => {
  it('extracts file listing and total uncompressed size from a ZIP file', async () => {
    const zip = makeZipBuffer([
      { name: 'readme.txt', size: 500 },
      { name: 'data/file.json', size: 1200 },
    ]);
    mockReadFile.mockResolvedValue(zip as never);

    const result = await extractArchiveMetadata('/archives/sample.zip');
    expect(result).toEqual<ArchiveMetadata>({
      fileCount: 2,
      files: ['readme.txt', 'data/file.json'],
      totalUncompressedSize: 1700,
    });
  });

  it('extracts file listing and total uncompressed size from a TAR file', async () => {
    const tar = makeTarBuffer([
      { name: 'hello.txt', size: 13 },
      { name: 'world.txt', size: 100 },
    ]);
    mockReadFile.mockResolvedValue(tar as never);

    const result = await extractArchiveMetadata('/archives/sample.tar');
    expect(result).toEqual<ArchiveMetadata>({
      fileCount: 2,
      files: ['hello.txt', 'world.txt'],
      totalUncompressedSize: 113,
    });
  });

  it('returns empty object for unsupported archive formats', async () => {
    const result = await extractArchiveMetadata('/archives/file.rar');
    expect(result).toEqual({});
  });

  it('returns null when file read fails', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never);

    const result = await extractArchiveMetadata('/archives/missing.zip');
    expect(result).toBeNull();
  });

  it('handles an empty ZIP archive', async () => {
    const zip = makeZipBuffer([]);
    mockReadFile.mockResolvedValue(zip as never);

    const result = await extractArchiveMetadata('/archives/empty.zip');
    expect(result).toEqual<ArchiveMetadata>({
      fileCount: 0,
      files: [],
      totalUncompressedSize: 0,
    });
  });
});
