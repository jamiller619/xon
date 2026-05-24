import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { type ArchiveEntry, listArchiveContents } from '../../media/archive.ts'

type FakeChildProcess = EventEmitter & { stdout: EventEmitter }

function makeProcess(): FakeChildProcess {
  const proc = new EventEmitter() as FakeChildProcess
  proc.stdout = new EventEmitter()
  return proc
}

const mockSpawn = vi.mocked(spawn)
const mockReadFile = vi.mocked(readFile)

beforeEach(() => {
  vi.clearAllMocks()
})

// ── ZIP test helpers ──────────────────────────────────────────────────────────

function makeZipBuffer(files: Array<{ name: string; size: number }>): Buffer {
  const localHeaders: Buffer[] = []
  const cdEntries: Buffer[] = []
  const offsets: number[] = []
  let localOffset = 0

  for (const f of files) {
    const nameBytes = Buffer.from(f.name, 'utf8')
    offsets.push(localOffset)

    const lh = Buffer.alloc(30 + nameBytes.length)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0, 6)
    lh.writeUInt16LE(0, 8)
    lh.writeUInt16LE(0, 10)
    lh.writeUInt16LE(0, 12)
    lh.writeUInt32LE(0, 14)
    lh.writeUInt32LE(f.size, 18)
    lh.writeUInt32LE(f.size, 22)
    lh.writeUInt16LE(nameBytes.length, 26)
    lh.writeUInt16LE(0, 28)
    nameBytes.copy(lh, 30)

    localHeaders.push(lh)
    localHeaders.push(Buffer.alloc(f.size))
    localOffset += 30 + nameBytes.length + f.size
  }

  let cdSize = 0
  for (let i = 0; i < files.length; i++) {
    const f = files[i] ?? { name: '', size: 0 }
    const nameBytes = Buffer.from(f.name, 'utf8')
    const cd = Buffer.alloc(46 + nameBytes.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(0, 16)
    cd.writeUInt32LE(f.size, 20)
    cd.writeUInt32LE(f.size, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offsets[i] ?? 0, 42)
    nameBytes.copy(cd, 46)

    cdEntries.push(cd)
    cdSize += cd.length
  }

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(localOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localHeaders, ...cdEntries, eocd])
}

function makeTarBuffer(
  files: Array<{ name: string; size: number; isDir?: boolean }>,
): Buffer {
  const blocks: Buffer[] = []

  for (const f of files) {
    const header = Buffer.alloc(512)
    Buffer.from(f.name).copy(header, 0)
    const sizeOctal = `${f.size.toString(8).padStart(11, '0')}\0`
    Buffer.from(sizeOctal).copy(header, 124)
    header[156] = f.isDir ? 0x35 : 0x30

    blocks.push(header)
    if (!f.isDir) {
      blocks.push(Buffer.alloc(Math.ceil(f.size / 512) * 512))
    }
  }

  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

// ── ZIP listing ───────────────────────────────────────────────────────────────

describe('listArchiveContents — ZIP', () => {
  it('lists files and directories from a ZIP archive', async () => {
    const zip = makeZipBuffer([
      { name: 'readme.txt', size: 500 },
      { name: 'src/main.ts', size: 1200 },
      { name: 'src/', size: 0 },
    ])
    mockReadFile.mockResolvedValue(zip as never)

    const result = await listArchiveContents('/test/archive.zip')
    expect(result).toEqual<ArchiveEntry[]>([
      { path: 'readme.txt', size: 500, isDirectory: false },
      { path: 'src/main.ts', size: 1200, isDirectory: false },
      { path: 'src/', size: 0, isDirectory: true },
    ])
  })

  it('returns empty array for an empty ZIP', async () => {
    const zip = makeZipBuffer([])
    mockReadFile.mockResolvedValue(zip as never)

    const result = await listArchiveContents('/test/empty.zip')
    expect(result).toEqual([])
  })

  it('returns empty array when file read fails', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never)

    const result = await listArchiveContents('/test/missing.zip')
    expect(result).toEqual([])
  })
})

// ── TAR listing ───────────────────────────────────────────────────────────────

describe('listArchiveContents — TAR', () => {
  it('lists regular files from a TAR archive', async () => {
    const tar = makeTarBuffer([
      { name: 'hello.txt', size: 13 },
      { name: 'data/world.txt', size: 100 },
    ])
    mockReadFile.mockResolvedValue(tar as never)

    const result = await listArchiveContents('/test/archive.tar')
    expect(result).toEqual<ArchiveEntry[]>([
      { path: 'hello.txt', size: 13, isDirectory: false },
      { path: 'data/world.txt', size: 100, isDirectory: false },
    ])
  })

  it('lists directories from a TAR archive', async () => {
    const tar = makeTarBuffer([
      { name: 'mydir/', size: 0, isDir: true },
      { name: 'mydir/file.txt', size: 50 },
    ])
    mockReadFile.mockResolvedValue(tar as never)

    const result = await listArchiveContents('/test/archive.tar')
    expect(result).toEqual<ArchiveEntry[]>([
      { path: 'mydir/', size: 0, isDirectory: true },
      { path: 'mydir/file.txt', size: 50, isDirectory: false },
    ])
  })

  it('also handles .tgz extension', async () => {
    const tar = makeTarBuffer([{ name: 'file.txt', size: 10 }])
    mockReadFile.mockResolvedValue(tar as never)

    const result = await listArchiveContents('/test/archive.tgz')
    expect(result).toHaveLength(1)
  })
})

// ── 7z listing ────────────────────────────────────────────────────────────────

describe('listArchiveContents — 7z', () => {
  it('parses 7z l -slt output into entries', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as unknown as ChildProcess)

    const sevenZOutput = [
      '7-Zip output header',
      '',
      '----------',
      'Path = readme.txt',
      'Folder = -',
      'Size = 1234',
      '',
      '----------',
      'Path = src',
      'Folder = +',
      'Size = 0',
      '',
      '----------',
      'Path = src/main.ts',
      'Folder = -',
      'Size = 5678',
      '',
    ].join('\n')

    const resultPromise = listArchiveContents('/test/archive.7z')

    await Promise.resolve().then(() => {
      proc.stdout.emit('data', Buffer.from(sevenZOutput))
      proc.emit('close', 0)
    })

    const result = await resultPromise
    expect(result).toEqual<ArchiveEntry[]>([
      { path: 'readme.txt', size: 1234, isDirectory: false },
      { path: 'src', size: 0, isDirectory: true },
      { path: 'src/main.ts', size: 5678, isDirectory: false },
    ])
  })

  it('returns empty array when 7z is not available', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as unknown as ChildProcess)

    const resultPromise = listArchiveContents('/test/archive.7z')

    await Promise.resolve().then(() => {
      proc.emit('error', new Error('ENOENT'))
    })

    const result = await resultPromise
    expect(result).toEqual([])
  })

  it('returns empty array when 7z exits non-zero', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as unknown as ChildProcess)

    const resultPromise = listArchiveContents('/test/archive.7z')

    await Promise.resolve().then(() => {
      proc.emit('close', 2)
    })

    const result = await resultPromise
    expect(result).toEqual([])
  })
})

// ── Unsupported format ────────────────────────────────────────────────────────

describe('listArchiveContents — unsupported format', () => {
  it('returns empty array for unsupported extensions', async () => {
    const result = await listArchiveContents('/test/archive.rar')
    expect(result).toEqual([])
  })
})
