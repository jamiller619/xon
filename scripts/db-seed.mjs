#!/usr/bin/env node
/**
 * Database seed script — populates xon.db with realistic sample data.
 *
 * Run AFTER the server has started at least once (to apply migrations):
 *   node scripts/db-seed.mjs
 *
 * Or with a custom data directory:
 *   DATA_DIR=packages/server/data node scripts/db-seed.mjs
 *
 * Users created (password same as username):
 *   admin / admin    — role: admin
 *   alice / alice    — role: user
 *   bob   / bob      — role: user
 *   guest / guest    — role: guest
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { hash } from '@node-rs/argon2'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'

const DATA_DIR = process.env.DATA_DIR ?? 'packages/server/data'
const DB_URL = `file:${join(DATA_DIR, 'xon.db')}`
const MIGRATIONS_DIR = resolve('packages/server/drizzle')

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1 }
const id = () => randomUUID()
const ts = () => Math.floor(Date.now() / 1000)

// ---------------------------------------------------------------------------
// Raw SQL helpers
// ---------------------------------------------------------------------------

async function run(client, sql, args = []) {
  await client.execute({ sql, args })
}

async function insert(client, table, row) {
  const cols = Object.keys(row)
  const placeholders = cols.map(() => '?').join(', ')
  const values = Object.values(row).map((v) =>
    typeof v === 'boolean' ? (v ? 1 : 0) : v,
  )
  await client.execute({
    sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
    args: values,
  })
}

async function insertMany(client, table, rows) {
  for (const row of rows) {
    await insert(client, table, row)
  }
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  mkdirSync(DATA_DIR, { recursive: true })

  const client = createClient({ url: DB_URL })
  await run(client, 'PRAGMA journal_mode=WAL')

  console.log(`Seeding: ${DB_URL}`)
  console.log('Running migrations...')
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  console.log('Migrations done.')
  console.log('Clearing existing data...')

  await run(client, 'PRAGMA foreign_keys = OFF')
  const tables = [
    'backup_verify_jobs',
    'backup_jobs',
    'backup_file_state',
    'backup_targets',
    'sync_runs',
    'sync_profiles',
    'suggested_groups',
    'duplicate_candidates',
    'image_hashes',
    'matching_queue',
    'group_members',
    'groups',
    'reading_positions',
    'media_progress',
    'favorites',
    'watchlist',
    'api_tokens',
    'refresh_tokens',
    'library_access',
    'media_items',
    'data_sources',
    'libraries',
    'users',
    'ai_settings',
    'server_settings',
  ]
  for (const table of tables) {
    await run(client, `DELETE FROM ${table}`)
  }
  await run(client, 'PRAGMA foreign_keys = ON')

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------
  console.log('Creating users...')

  const adminId = id()
  const aliceId = id()
  const bobId = id()
  const guestId = id()

  const [adminHash, aliceHash, bobHash, guestHash] = await Promise.all([
    hash('admin', ARGON2_OPTIONS),
    hash('alice', ARGON2_OPTIONS),
    hash('bob', ARGON2_OPTIONS),
    hash('guest', ARGON2_OPTIONS),
  ])

  await insertMany(client, 'users', [
    {
      id: adminId,
      username: 'admin',
      email: 'admin@xon.local',
      display_name: 'Administrator',
      password_hash: adminHash,
      role: 'admin',
      max_content_rating: 'none',
      hide_drm_items: 0,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: aliceId,
      username: 'alice',
      email: 'alice@xon.local',
      display_name: 'Alice',
      password_hash: aliceHash,
      role: 'user',
      max_content_rating: 'R',
      hide_drm_items: 0,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: bobId,
      username: 'bob',
      email: 'bob@xon.local',
      display_name: 'Bob',
      password_hash: bobHash,
      role: 'user',
      max_content_rating: 'PG-13',
      hide_drm_items: 0,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: guestId,
      username: 'guest',
      email: 'guest@xon.local',
      display_name: 'Guest',
      password_hash: guestHash,
      role: 'guest',
      max_content_rating: 'PG',
      hide_drm_items: 1,
      created_at: ts(),
      updated_at: ts(),
    },
  ])

  // -------------------------------------------------------------------------
  // Libraries + Data sources
  // -------------------------------------------------------------------------
  console.log('Creating libraries...')

  const moviesLibId = id()
  const tvLibId = id()
  const musicLibId = id()
  const booksLibId = id()
  const photosLibId = id()

  await insertMany(client, 'libraries', [
    {
      id: moviesLibId,
      name: 'Movies',
      description: 'Feature films',
      allowed_media_types: JSON.stringify(['Movies']),
      scan_schedule: '0 3 * * *',
      watch_enabled: 1,
      hide_drm_items: 0,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: tvLibId,
      name: 'TV Shows',
      description: 'Television series and episodes',
      allowed_media_types: JSON.stringify(['TV Shows']),
      scan_schedule: '0 3 * * *',
      watch_enabled: 1,
      hide_drm_items: 0,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: musicLibId,
      name: 'Music',
      description: 'Albums and singles',
      allowed_media_types: JSON.stringify(['Music']),
      scan_schedule: '0 4 * * 0',
      watch_enabled: 1,
      hide_drm_items: 0,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: booksLibId,
      name: 'Books',
      description: 'eBooks, documents, and audiobooks',
      allowed_media_types: JSON.stringify(['Documents', 'Audiobooks']),
      scan_schedule: null,
      watch_enabled: 0,
      hide_drm_items: 1,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: photosLibId,
      name: 'Photos',
      description: 'Personal photo collection',
      allowed_media_types: JSON.stringify(['Pictures']),
      scan_schedule: null,
      watch_enabled: 1,
      hide_drm_items: 0,
      created_at: ts(),
      updated_at: ts(),
    },
  ])

  const moviesDsId = id()
  const tvDsId = id()
  const musicDsId = id()
  const booksDsId = id()
  const photosDsId = id()

  await insertMany(client, 'data_sources', [
    {
      id: moviesDsId,
      library_id: moviesLibId,
      type: 'local',
      path: '/media/movies',
      recursive: 1,
      enabled: 1,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: tvDsId,
      library_id: tvLibId,
      type: 'local',
      path: '/media/tv',
      recursive: 1,
      enabled: 1,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: musicDsId,
      library_id: musicLibId,
      type: 'local',
      path: '/media/music',
      recursive: 1,
      enabled: 1,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: booksDsId,
      library_id: booksLibId,
      type: 'local',
      path: '/media/books',
      recursive: 1,
      enabled: 1,
      created_at: ts(),
      updated_at: ts(),
    },
    {
      id: photosDsId,
      library_id: photosLibId,
      type: 'local',
      path: '/media/photos',
      recursive: 1,
      enabled: 1,
      created_at: ts(),
      updated_at: ts(),
    },
  ])

  // -------------------------------------------------------------------------
  // Library access
  // -------------------------------------------------------------------------
  const access = [
    // admin gets everything
    [adminId, moviesLibId],
    [adminId, tvLibId],
    [adminId, musicLibId],
    [adminId, booksLibId],
    [adminId, photosLibId],
    // alice gets everything
    [aliceId, moviesLibId],
    [aliceId, tvLibId],
    [aliceId, musicLibId],
    [aliceId, booksLibId],
    [aliceId, photosLibId],
    // bob gets movies, music, photos
    [bobId, moviesLibId],
    [bobId, musicLibId],
    [bobId, photosLibId],
    // guest only movies
    [guestId, moviesLibId],
  ]

  for (const [userId, libraryId] of access) {
    await insert(client, 'library_access', {
      user_id: userId,
      library_id: libraryId,
      granted_at: ts(),
      granted_by: adminId,
    })
  }

  // -------------------------------------------------------------------------
  // Movies
  // -------------------------------------------------------------------------
  console.log('Creating movie media items...')

  function movie({ title, year, dir, cast, genres, runtime, rating, studio, desc, size }) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return {
      id: id(),
      library_id: moviesLibId,
      data_source_id: moviesDsId,
      file_path: `/media/movies/${title} (${year})/${title} (${year}).mkv`,
      file_name: `${title} (${year}).mkv`,
      file_size: size ?? Math.floor(7_500_000_000 + Math.random() * 7_000_000_000),
      mime_type: 'video/x-matroska',
      media_category: 'Movies',
      content_rating: rating,
      title,
      description: desc,
      metadata: JSON.stringify({ year, director: dir, cast, genres, runtime, studio }),
      drm_protected: 0,
      created_at: ts(),
      updated_at: ts(),
      scanned_at: ts(),
    }
  }

  const matrix = movie({ title: 'The Matrix', year: 1999, dir: 'The Wachowskis', cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss'], genres: ['Action', 'Sci-Fi'], runtime: 136, rating: 'PG-13', studio: 'Warner Bros.', desc: 'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.' })
  const inception = movie({ title: 'Inception', year: 2010, dir: 'Christopher Nolan', cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Ellen Page'], genres: ['Action', 'Sci-Fi', 'Thriller'], runtime: 148, rating: 'PG-13', studio: 'Warner Bros.', desc: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea.' })
  const darkKnight = movie({ title: 'The Dark Knight', year: 2008, dir: 'Christopher Nolan', cast: ['Christian Bale', 'Heath Ledger', 'Aaron Eckhart'], genres: ['Action', 'Crime', 'Drama'], runtime: 152, rating: 'PG-13', studio: 'Warner Bros.', desc: 'Batman raises the stakes in his war on crime as the Joker wreaks havoc and chaos on the people of Gotham.' })
  const interstellar = movie({ title: 'Interstellar', year: 2014, dir: 'Christopher Nolan', cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'], genres: ['Adventure', 'Drama', 'Sci-Fi'], runtime: 169, rating: 'PG-13', studio: 'Paramount', desc: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.' })
  const pulpFiction = movie({ title: 'Pulp Fiction', year: 1994, dir: 'Quentin Tarantino', cast: ['John Travolta', 'Uma Thurman', 'Samuel L. Jackson'], genres: ['Crime', 'Drama'], runtime: 154, rating: 'R', studio: 'Miramax', desc: 'The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.' })
  const godfather = movie({ title: 'The Godfather', year: 1972, dir: 'Francis Ford Coppola', cast: ['Marlon Brando', 'Al Pacino', 'James Caan'], genres: ['Crime', 'Drama'], runtime: 175, rating: 'R', studio: 'Paramount', desc: 'The aging patriarch of an organized crime dynasty transfers control to his reluctant son.' })
  const forrestGump = movie({ title: 'Forrest Gump', year: 1994, dir: 'Robert Zemeckis', cast: ['Tom Hanks', 'Robin Wright', 'Gary Sinise'], genres: ['Drama', 'Romance'], runtime: 142, rating: 'PG-13', studio: 'Paramount', desc: 'The presidencies of Kennedy and Johnson, Vietnam, Watergate, and other events unfold through the eyes of an Alabama man.' })
  const lotr1 = movie({ title: 'The Lord of the Rings: The Fellowship of the Ring', year: 2001, dir: 'Peter Jackson', cast: ['Elijah Wood', 'Ian McKellen', 'Viggo Mortensen'], genres: ['Adventure', 'Drama', 'Fantasy'], runtime: 178, rating: 'PG-13', studio: 'New Line Cinema', desc: 'A meek Hobbit from the Shire and eight companions set out on a journey to destroy the powerful One Ring.' })
  const lotr2 = movie({ title: 'The Lord of the Rings: The Two Towers', year: 2002, dir: 'Peter Jackson', cast: ['Elijah Wood', 'Ian McKellen', 'Viggo Mortensen'], genres: ['Adventure', 'Drama', 'Fantasy'], runtime: 179, rating: 'PG-13', studio: 'New Line Cinema', desc: 'While Frodo and Sam edge closer to Mordor, the divided fellowship makes a stand against Sauron\'s new ally.' })
  const lotr3 = movie({ title: 'The Lord of the Rings: The Return of the King', year: 2003, dir: 'Peter Jackson', cast: ['Elijah Wood', 'Ian McKellen', 'Viggo Mortensen'], genres: ['Adventure', 'Drama', 'Fantasy'], runtime: 201, rating: 'PG-13', studio: 'New Line Cinema', desc: 'Gandalf and Aragorn lead the World of Men against Sauron\'s army to draw his gaze from Frodo and Sam.' })
  const spiritedAway = movie({ title: 'Spirited Away', year: 2001, dir: 'Hayao Miyazaki', cast: ['Daveigh Chase', 'Suzanne Pleshette', 'Miyu Irino'], genres: ['Animation', 'Adventure', 'Family'], runtime: 125, rating: 'PG', studio: 'Studio Ghibli', desc: 'During her family\'s move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits.' })
  const toyStory = movie({ title: 'Toy Story', year: 1995, dir: 'John Lasseter', cast: ['Tom Hanks', 'Tim Allen', 'Don Rickles'], genres: ['Animation', 'Adventure', 'Comedy'], runtime: 81, rating: 'G', studio: 'Pixar', desc: 'A cowboy doll is profoundly threatened and jealous when a new spaceman figure supplants him as top toy.' })
  const findingNemo = movie({ title: 'Finding Nemo', year: 2003, dir: 'Andrew Stanton', cast: ['Albert Brooks', 'Ellen DeGeneres', 'Alexander Gould'], genres: ['Animation', 'Adventure', 'Comedy'], runtime: 100, rating: 'G', studio: 'Pixar', desc: 'After his son is taken by a diver, an anxious clownfish sets out on a journey to bring him home.' })
  const shawshank = movie({ title: 'The Shawshank Redemption', year: 1994, dir: 'Frank Darabont', cast: ['Tim Robbins', 'Morgan Freeman', 'Bob Gunton'], genres: ['Drama'], runtime: 142, rating: 'R', studio: 'Castle Rock', desc: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.' })
  const se7en = movie({ title: 'Se7en', year: 1995, dir: 'David Fincher', cast: ['Morgan Freeman', 'Brad Pitt', 'Kevin Spacey'], genres: ['Crime', 'Drama', 'Mystery'], runtime: 127, rating: 'R', studio: 'New Line Cinema', desc: 'Two detectives hunt a serial killer who uses the seven deadly sins as his motives.' })

  const movieItems = [matrix, inception, darkKnight, interstellar, pulpFiction, godfather, forrestGump, lotr1, lotr2, lotr3, spiritedAway, toyStory, findingNemo, shawshank, se7en]
  await insertMany(client, 'media_items', movieItems)

  // -------------------------------------------------------------------------
  // TV Shows
  // -------------------------------------------------------------------------
  console.log('Creating TV show episodes...')

  function episode({ seriesTitle, season, ep, title, airDate, rating, desc, size }) {
    const pad = (n) => String(n).padStart(2, '0')
    const code = `S${pad(season)}E${pad(ep)}`
    return {
      id: id(),
      library_id: tvLibId,
      data_source_id: tvDsId,
      file_path: `/media/tv/${seriesTitle}/Season ${season}/${code} - ${title}.mkv`,
      file_name: `${code} - ${title}.mkv`,
      file_size: size ?? Math.floor(800_000_000 + Math.random() * 1_200_000_000),
      mime_type: 'video/x-matroska',
      media_category: 'TV Shows',
      content_rating: rating ?? 'R',
      title: `${seriesTitle} — ${code} — ${title}`,
      description: desc,
      metadata: JSON.stringify({ seriesTitle, season, episode: ep, airDate }),
      drm_protected: 0,
      created_at: ts(),
      updated_at: ts(),
      scanned_at: ts(),
    }
  }

  // Breaking Bad
  const bbS1 = [
    episode({ seriesTitle: 'Breaking Bad', season: 1, ep: 1, title: 'Pilot', airDate: '2008-01-20', desc: 'Walter White, a chemistry teacher, starts cooking meth after being diagnosed with cancer.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 1, ep: 2, title: "Cat's in the Bag", airDate: '2008-01-27', desc: 'Walt and Jesse try to dispose of the bodies and figure out who gets to live.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 1, ep: 3, title: "And the Bag's in the River", airDate: '2008-02-10', desc: 'Walt must decide what to do with Krazy-8.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 1, ep: 4, title: 'Cancer Man', airDate: '2008-02-17', desc: 'Walt tells his family about his cancer while Jesse reconnects with his.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 1, ep: 5, title: 'Gray Matter', airDate: '2008-02-24', desc: "Walt rejects treatment money from old colleagues." }),
    episode({ seriesTitle: 'Breaking Bad', season: 1, ep: 6, title: 'Crazy Handful of Nothin\'', airDate: '2008-03-02', desc: 'Walt and Jesse approach a local drug distributor.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 1, ep: 7, title: 'A No-Rough-Stuff-Type Deal', airDate: '2008-03-09', desc: 'Walt and Jesse try to come up with methylamine.' }),
  ]
  const bbS2 = [
    episode({ seriesTitle: 'Breaking Bad', season: 2, ep: 1, title: 'Seven Thirty-Seven', airDate: '2009-03-08', desc: 'Walt and Jesse fear retaliation from Tuco.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 2, ep: 2, title: 'Grilled', airDate: '2009-03-15', desc: "Walt and Jesse are taken to Tuco's compound." }),
    episode({ seriesTitle: 'Breaking Bad', season: 2, ep: 3, title: 'Bit by a Dead Bee', airDate: '2009-03-22', desc: 'Walt and Jesse try to cover their tracks.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 2, ep: 4, title: 'Down', airDate: '2009-03-29', desc: 'Jesse loses his apartment and spirals.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 2, ep: 5, title: 'Breakage', airDate: '2009-04-05', desc: 'Walt and Jesse build a new distribution network.' }),
  ]
  const bbS3 = [
    episode({ seriesTitle: 'Breaking Bad', season: 3, ep: 1, title: 'No Más', airDate: '2010-03-21', desc: 'Walt tries to leave the drug trade but is pulled back in.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 3, ep: 2, title: 'Caballo sin Nombre', airDate: '2010-03-28', desc: 'The Salamanca cousins are closing in.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 3, ep: 3, title: 'I.F.T.', airDate: '2010-04-04', desc: 'Skyler makes a decision that shocks Walt.' }),
    episode({ seriesTitle: 'Breaking Bad', season: 3, ep: 4, title: 'Green Light', airDate: '2010-04-11', desc: 'Walt learns Jesse has been making product without him.' }),
  ]

  // The Office
  const offS1 = [
    episode({ seriesTitle: 'The Office', season: 1, ep: 1, title: 'Pilot', airDate: '2005-03-24', rating: 'PG-13', desc: 'Documentary crew arrives at Dunder Mifflin Scranton.' }),
    episode({ seriesTitle: 'The Office', season: 1, ep: 2, title: 'Diversity Day', airDate: '2005-03-29', rating: 'PG-13', desc: 'Michael leads a diversity training session.' }),
    episode({ seriesTitle: 'The Office', season: 1, ep: 3, title: 'Health Care', airDate: '2005-04-05', rating: 'PG-13', desc: 'Michael is tasked with cutting health care benefits.' }),
    episode({ seriesTitle: 'The Office', season: 1, ep: 4, title: 'The Alliance', airDate: '2005-04-12', rating: 'PG-13', desc: 'Dwight and Jim team up against the warehouse.' }),
    episode({ seriesTitle: 'The Office', season: 1, ep: 5, title: 'Basketball', airDate: '2005-04-19', rating: 'PG-13', desc: 'Office vs warehouse basketball game.' }),
    episode({ seriesTitle: 'The Office', season: 1, ep: 6, title: 'Hot Girl', airDate: '2005-04-26', rating: 'PG-13', desc: 'A sales rep from a purse company visits the office.' }),
  ]
  const offS2 = [
    episode({ seriesTitle: 'The Office', season: 2, ep: 1, title: 'The Dundies', airDate: '2005-09-20', rating: 'PG-13', desc: 'Michael hosts the Dundies award ceremony.' }),
    episode({ seriesTitle: 'The Office', season: 2, ep: 2, title: 'Sexual Harassment', airDate: '2005-09-27', rating: 'PG-13', desc: 'HR visits after an offensive joke email.' }),
    episode({ seriesTitle: 'The Office', season: 2, ep: 3, title: 'Office Olympics', airDate: '2005-10-04', rating: 'PG-13', desc: "Jim and Pam organize the Office Olympics." }),
    episode({ seriesTitle: 'The Office', season: 2, ep: 4, title: 'The Fire', airDate: '2005-10-11', rating: 'PG-13', desc: 'The office is evacuated due to a fire drill.' }),
    episode({ seriesTitle: 'The Office', season: 2, ep: 5, title: 'Halloween', airDate: '2005-10-18', rating: 'PG-13', desc: 'Michael must fire someone by end of day.' }),
  ]

  // Planet Earth
  const peS1 = [
    episode({ seriesTitle: 'Planet Earth', season: 1, ep: 1, title: 'From Pole to Pole', airDate: '2006-03-05', rating: 'G', desc: 'A journey from the Arctic to the Antarctic.', size: 4_200_000_000 }),
    episode({ seriesTitle: 'Planet Earth', season: 1, ep: 2, title: 'Mountains', airDate: '2006-03-12', rating: 'G', desc: 'Life on the world\'s great mountain ranges.', size: 4_100_000_000 }),
    episode({ seriesTitle: 'Planet Earth', season: 1, ep: 3, title: 'Fresh Water', airDate: '2006-03-19', rating: 'G', desc: 'The drama of rivers, lakes and waterfalls.', size: 4_050_000_000 }),
    episode({ seriesTitle: 'Planet Earth', season: 1, ep: 4, title: 'Caves', airDate: '2006-03-26', rating: 'G', desc: 'A journey into the dark world of caves.', size: 3_900_000_000 }),
    episode({ seriesTitle: 'Planet Earth', season: 1, ep: 5, title: 'Deserts', airDate: '2006-04-02', rating: 'G', desc: 'Survival in the most extreme places on Earth.', size: 4_300_000_000 }),
    episode({ seriesTitle: 'Planet Earth', season: 1, ep: 6, title: 'Ice Worlds', airDate: '2006-04-09', rating: 'G', desc: 'The frozen worlds at the poles.', size: 4_150_000_000 }),
  ]

  const allEpisodes = [...bbS1, ...bbS2, ...bbS3, ...offS1, ...offS2, ...peS1]
  await insertMany(client, 'media_items', allEpisodes)

  // -------------------------------------------------------------------------
  // Music
  // -------------------------------------------------------------------------
  console.log('Creating music tracks...')

  function track({ artist, album, year, genre, num, title, duration, size }) {
    const pad = (n) => String(n).padStart(2, '0')
    return {
      id: id(),
      library_id: musicLibId,
      data_source_id: musicDsId,
      file_path: `/media/music/${artist}/${album}/${pad(num)} - ${title}.flac`,
      file_name: `${pad(num)} - ${title}.flac`,
      file_size: size ?? Math.floor(25_000_000 + Math.random() * 40_000_000),
      mime_type: 'audio/flac',
      media_category: 'Music',
      content_rating: 'unrated',
      title,
      description: null,
      metadata: JSON.stringify({ artist, album, year, genre, trackNumber: num, duration }),
      drm_protected: 0,
      created_at: ts(),
      updated_at: ts(),
      scanned_at: ts(),
    }
  }

  // Pink Floyd — The Dark Side of the Moon (1973)
  const dsotm = [
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 1, title: 'Speak to Me / Breathe', duration: 231 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 2, title: 'On the Run', duration: 225 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 3, title: 'Time', duration: 421 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 4, title: 'The Great Gig in the Sky', duration: 283 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 5, title: 'Money', duration: 382 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 6, title: 'Us and Them', duration: 462 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 7, title: 'Any Colour You Like', duration: 213 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 8, title: 'Brain Damage', duration: 228 }),
    track({ artist: 'Pink Floyd', album: 'The Dark Side of the Moon', year: 1973, genre: 'Progressive Rock', num: 9, title: 'Eclipse', duration: 131 }),
  ]

  // Pink Floyd — Wish You Were Here (1975)
  const wywh = [
    track({ artist: 'Pink Floyd', album: 'Wish You Were Here', year: 1975, genre: 'Progressive Rock', num: 1, title: 'Shine On You Crazy Diamond (Parts I-V)', duration: 818 }),
    track({ artist: 'Pink Floyd', album: 'Wish You Were Here', year: 1975, genre: 'Progressive Rock', num: 2, title: 'Welcome to the Machine', duration: 450 }),
    track({ artist: 'Pink Floyd', album: 'Wish You Were Here', year: 1975, genre: 'Progressive Rock', num: 3, title: 'Have a Cigar', duration: 300 }),
    track({ artist: 'Pink Floyd', album: 'Wish You Were Here', year: 1975, genre: 'Progressive Rock', num: 4, title: 'Wish You Were Here', duration: 334 }),
    track({ artist: 'Pink Floyd', album: 'Wish You Were Here', year: 1975, genre: 'Progressive Rock', num: 5, title: 'Shine On You Crazy Diamond (Parts VI-IX)', duration: 689 }),
  ]

  // Radiohead — OK Computer (1997)
  const okComputer = [
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 1, title: 'Airbag', duration: 292 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 2, title: 'Paranoid Android', duration: 387 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 3, title: 'Subterranean Homesick Alien', duration: 261 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 4, title: 'Exit Music (For a Film)', duration: 249 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 5, title: 'Let Down', duration: 294 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 6, title: 'Karma Police', duration: 261 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 7, title: 'Fitter Happier', duration: 116 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 8, title: 'Electioneering', duration: 230 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 9, title: 'Climbing Up the Walls', duration: 248 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 10, title: 'No Surprises', duration: 228 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 11, title: 'Lucky', duration: 257 }),
    track({ artist: 'Radiohead', album: 'OK Computer', year: 1997, genre: 'Alternative Rock', num: 12, title: 'The Tourist', duration: 325 }),
  ]

  // Radiohead — Kid A (2000)
  const kidA = [
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 1, title: 'Everything in Its Right Place', duration: 248 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 2, title: 'Kid A', duration: 275 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 3, title: 'The National Anthem', duration: 222 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 4, title: 'How to Disappear Completely', duration: 357 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 5, title: 'Treefingers', duration: 229 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 6, title: 'Optimistic', duration: 264 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 7, title: 'In Limbo', duration: 214 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 8, title: 'Idioteque', duration: 282 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 9, title: 'Morning Bell', duration: 268 }),
    track({ artist: 'Radiohead', album: 'Kid A', year: 2000, genre: 'Electronic', num: 10, title: 'Motion Picture Soundtrack', duration: 268 }),
  ]

  // Miles Davis — Kind of Blue (1959)
  const kindOfBlue = [
    track({ artist: 'Miles Davis', album: 'Kind of Blue', year: 1959, genre: 'Jazz', num: 1, title: 'So What', duration: 562 }),
    track({ artist: 'Miles Davis', album: 'Kind of Blue', year: 1959, genre: 'Jazz', num: 2, title: 'Freddie Freeloader', duration: 585 }),
    track({ artist: 'Miles Davis', album: 'Kind of Blue', year: 1959, genre: 'Jazz', num: 3, title: 'Blue in Green', duration: 337 }),
    track({ artist: 'Miles Davis', album: 'Kind of Blue', year: 1959, genre: 'Jazz', num: 4, title: 'All Blues', duration: 695 }),
    track({ artist: 'Miles Davis', album: 'Kind of Blue', year: 1959, genre: 'Jazz', num: 5, title: 'Flamenco Sketches', duration: 570 }),
  ]

  // Miles Davis — Bitches Brew (1970)
  const bitchesBrew = [
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 1, title: 'Pharaoh\'s Dance', duration: 1220 }),
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 2, title: 'Bitches Brew', duration: 1621 }),
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 3, title: 'Spanish Key', duration: 1730 }),
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 4, title: 'John McLaughlin', duration: 279 }),
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 5, title: 'Miles Runs the Voodoo Down', duration: 1402 }),
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 6, title: 'Sanctuary', duration: 659 }),
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 7, title: 'Feio', duration: 527 }),
    track({ artist: 'Miles Davis', album: 'Bitches Brew', year: 1970, genre: 'Jazz Fusion', num: 8, title: 'Yaphet', duration: 484 }),
  ]

  const allTracks = [...dsotm, ...wywh, ...okComputer, ...kidA, ...kindOfBlue, ...bitchesBrew]
  await insertMany(client, 'media_items', allTracks)

  // -------------------------------------------------------------------------
  // Books
  // -------------------------------------------------------------------------
  console.log('Creating book items...')

  function book({ author, title, series, seriesNum, year, publisher, pageCount, isbn, format, desc }) {
    const ext = format === 'pdf' ? 'pdf' : 'epub'
    const mime = format === 'pdf' ? 'application/pdf' : 'application/epub+zip'
    const dirName = series ? `${series}` : author
    return {
      id: id(),
      library_id: booksLibId,
      data_source_id: booksDsId,
      file_path: `/media/books/${dirName}/${title}.${ext}`,
      file_name: `${title}.${ext}`,
      file_size: Math.floor(1_500_000 + Math.random() * 8_000_000),
      mime_type: mime,
      media_category: 'Documents',
      content_rating: 'unrated',
      title,
      description: desc,
      metadata: JSON.stringify({ author, year, publisher, pageCount, isbn, language: 'en', seriesTitle: series, seriesNumber: seriesNum }),
      drm_protected: 0,
      created_at: ts(),
      updated_at: ts(),
      scanned_at: ts(),
    }
  }

  const fellowship = book({ author: 'J.R.R. Tolkien', title: 'The Fellowship of the Ring', series: 'The Lord of the Rings', seriesNum: 1, year: 1954, publisher: 'Allen & Unwin', pageCount: 423, isbn: '978-0-261-10235-4', desc: 'A Hobbit named Frodo inherits a ring of immense power and sets off on a perilous journey.' })
  const twoTowers = book({ author: 'J.R.R. Tolkien', title: 'The Two Towers', series: 'The Lord of the Rings', seriesNum: 2, year: 1954, publisher: 'Allen & Unwin', pageCount: 352, isbn: '978-0-261-10236-1', desc: 'The Fellowship is broken. Some must fight in the battle for Rohan while others continue toward Mordor.' })
  const returnOfKing = book({ author: 'J.R.R. Tolkien', title: 'The Return of the King', series: 'The Lord of the Rings', seriesNum: 3, year: 1955, publisher: 'Allen & Unwin', pageCount: 416, isbn: '978-0-261-10237-8', desc: 'The final battle for Middle-Earth while Frodo and Sam reach Mount Doom.' })
  const hitchhiker1 = book({ author: 'Douglas Adams', title: "The Hitchhiker's Guide to the Galaxy", series: "Hitchhiker's Guide", seriesNum: 1, year: 1979, publisher: 'Pan Books', pageCount: 193, isbn: '978-0-330-25864-7', desc: "Seconds before the Earth is demolished for a bypass, Arthur Dent is whisked off into space." })
  const hitchhiker2 = book({ author: 'Douglas Adams', title: 'The Restaurant at the End of the Universe', series: "Hitchhiker's Guide", seriesNum: 2, year: 1980, publisher: 'Pan Books', pageCount: 208, isbn: '978-0-330-26213-2', desc: "Facing annihilation, Arthur, Ford, Zaphod, and Trillian escape to the best restaurant in the universe." })
  const hitchhiker3 = book({ author: 'Douglas Adams', title: 'Life, the Universe and Everything', series: "Hitchhiker's Guide", seriesNum: 3, year: 1982, publisher: 'Pan Books', pageCount: 224, isbn: '978-0-330-26738-0', desc: "Arthur Dent finds himself drawn into a dangerous mission to prevent a galactic war." })
  const doet = book({ author: 'Don Norman', title: 'The Design of Everyday Things', year: 2013, publisher: 'Basic Books', pageCount: 368, isbn: '978-0-465-05065-9', format: 'pdf', desc: 'A powerful primer on good design that shows how usability can make or break a product.' })
  const cleanCode = book({ author: 'Robert C. Martin', title: 'Clean Code', year: 2008, publisher: 'Prentice Hall', pageCount: 431, isbn: '978-0-13-235088-4', format: 'pdf', desc: 'A handbook of agile software craftsmanship that teaches programmers to write better code.' })
  const gatsby = book({ author: 'F. Scott Fitzgerald', title: 'The Great Gatsby', year: 1925, publisher: 'Scribner', pageCount: 180, isbn: '978-0-7432-7356-5', desc: 'The story of the fabulously wealthy Jay Gatsby and his love for the beautiful Daisy Buchanan.' })
  const dune = book({ author: 'Frank Herbert', title: 'Dune', year: 1965, publisher: 'Chilton Books', pageCount: 412, isbn: '978-0-441-17271-9', desc: 'A desert planet, a precious resource, betrayal, and the rise of a messianic leader.' })

  const bookItems = [fellowship, twoTowers, returnOfKing, hitchhiker1, hitchhiker2, hitchhiker3, doet, cleanCode, gatsby, dune]
  await insertMany(client, 'media_items', bookItems)

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------
  console.log('Creating photo items...')

  function photo({ album, num, camera, location, width, height, dateTaken }) {
    const pad = (n) => String(n).padStart(4, '0')
    const filename = `IMG_${pad(num)}.jpg`
    return {
      id: id(),
      library_id: photosLibId,
      data_source_id: photosDsId,
      file_path: `/media/photos/${album}/${filename}`,
      file_name: filename,
      file_size: Math.floor(3_500_000 + Math.random() * 8_000_000),
      mime_type: 'image/jpeg',
      media_category: 'Pictures',
      content_rating: 'G',
      title: `${album} — ${filename}`,
      description: null,
      metadata: JSON.stringify({ width, height, camera, dateTaken, location }),
      drm_protected: 0,
      created_at: ts(),
      updated_at: ts(),
      scanned_at: ts(),
    }
  }

  const vacPhotos = Array.from({ length: 6 }, (_, i) =>
    photo({ album: 'Vacation 2023', num: i + 1, camera: 'iPhone 15 Pro', location: 'Paris, France', width: 4032, height: 3024, dateTaken: `2023-07-${15 + i}T10:${30 + i}:00Z` }),
  )
  const famPhotos = Array.from({ length: 6 }, (_, i) =>
    photo({ album: 'Family Photos', num: 100 + i, camera: 'Canon EOS R5', location: 'Home', width: 8192, height: 5464, dateTaken: `2024-12-${25 + (i % 6)}T14:00:00Z` }),
  )
  const wildPhotos = Array.from({ length: 6 }, (_, i) =>
    photo({ album: 'Wildlife', num: 200 + i, camera: 'Nikon D850', location: 'Yellowstone National Park', width: 8256, height: 5504, dateTaken: `2024-08-${10 + i}T07:15:00Z` }),
  )

  const allPhotos = [...vacPhotos, ...famPhotos, ...wildPhotos]
  await insertMany(client, 'media_items', allPhotos)

  // -------------------------------------------------------------------------
  // Groups
  // -------------------------------------------------------------------------
  console.log('Creating groups...')

  // Movie collection — LotR
  const lotrCollId = id()
  await insert(client, 'groups', { id: lotrCollId, library_id: moviesLibId, type: 'collection', title: 'The Lord of the Rings Trilogy', metadata: JSON.stringify({ description: 'Peter Jackson\'s landmark fantasy trilogy' }), created_at: ts() })
  for (const [order, item] of [[0, lotr1], [1, lotr2], [2, lotr3]]) {
    await insert(client, 'group_members', { group_id: lotrCollId, media_item_id: item.id, sort_order: order })
  }

  // TV — Breaking Bad series/seasons
  const bbSeriesId = id()
  await insert(client, 'groups', { id: bbSeriesId, library_id: tvLibId, type: 'series', title: 'Breaking Bad', metadata: JSON.stringify({ year: 2008, network: 'AMC', totalSeasons: 3 }), created_at: ts() })

  const bbS1Id = id()
  await insert(client, 'groups', { id: bbS1Id, library_id: tvLibId, type: 'season', title: 'Breaking Bad — Season 1', parent_group_id: bbSeriesId, metadata: JSON.stringify({ season: 1, year: 2008 }), created_at: ts() })
  for (const [i, ep] of bbS1.entries()) {
    await insert(client, 'group_members', { group_id: bbS1Id, media_item_id: ep.id, sort_order: i })
  }

  const bbS2Id = id()
  await insert(client, 'groups', { id: bbS2Id, library_id: tvLibId, type: 'season', title: 'Breaking Bad — Season 2', parent_group_id: bbSeriesId, metadata: JSON.stringify({ season: 2, year: 2009 }), created_at: ts() })
  for (const [i, ep] of bbS2.entries()) {
    await insert(client, 'group_members', { group_id: bbS2Id, media_item_id: ep.id, sort_order: i })
  }

  const bbS3Id = id()
  await insert(client, 'groups', { id: bbS3Id, library_id: tvLibId, type: 'season', title: 'Breaking Bad — Season 3', parent_group_id: bbSeriesId, metadata: JSON.stringify({ season: 3, year: 2010 }), created_at: ts() })
  for (const [i, ep] of bbS3.entries()) {
    await insert(client, 'group_members', { group_id: bbS3Id, media_item_id: ep.id, sort_order: i })
  }

  // TV — The Office
  const offSeriesId = id()
  await insert(client, 'groups', { id: offSeriesId, library_id: tvLibId, type: 'series', title: 'The Office', metadata: JSON.stringify({ year: 2005, network: 'NBC', totalSeasons: 2 }), created_at: ts() })

  const offS1Id = id()
  await insert(client, 'groups', { id: offS1Id, library_id: tvLibId, type: 'season', title: 'The Office — Season 1', parent_group_id: offSeriesId, metadata: JSON.stringify({ season: 1, year: 2005 }), created_at: ts() })
  for (const [i, ep] of offS1.entries()) {
    await insert(client, 'group_members', { group_id: offS1Id, media_item_id: ep.id, sort_order: i })
  }

  const offS2Id = id()
  await insert(client, 'groups', { id: offS2Id, library_id: tvLibId, type: 'season', title: 'The Office — Season 2', parent_group_id: offSeriesId, metadata: JSON.stringify({ season: 2, year: 2005 }), created_at: ts() })
  for (const [i, ep] of offS2.entries()) {
    await insert(client, 'group_members', { group_id: offS2Id, media_item_id: ep.id, sort_order: i })
  }

  // TV — Planet Earth
  const peSeriesId = id()
  await insert(client, 'groups', { id: peSeriesId, library_id: tvLibId, type: 'series', title: 'Planet Earth', metadata: JSON.stringify({ year: 2006, network: 'BBC', totalSeasons: 1 }), created_at: ts() })

  const peS1Id = id()
  await insert(client, 'groups', { id: peS1Id, library_id: tvLibId, type: 'season', title: 'Planet Earth — Season 1', parent_group_id: peSeriesId, metadata: JSON.stringify({ season: 1, year: 2006 }), created_at: ts() })
  for (const [i, ep] of peS1.entries()) {
    await insert(client, 'group_members', { group_id: peS1Id, media_item_id: ep.id, sort_order: i })
  }

  // Music — Pink Floyd artist + albums
  const pfArtistId = id()
  await insert(client, 'groups', { id: pfArtistId, library_id: musicLibId, type: 'artist', title: 'Pink Floyd', metadata: JSON.stringify({ genre: 'Progressive Rock', country: 'UK', formedYear: 1965 }), created_at: ts() })

  const dsotmAlbumId = id()
  await insert(client, 'groups', { id: dsotmAlbumId, library_id: musicLibId, type: 'album', title: 'The Dark Side of the Moon', parent_group_id: pfArtistId, metadata: JSON.stringify({ artist: 'Pink Floyd', year: 1973, label: 'Harvest' }), created_at: ts() })
  for (const [i, t] of dsotm.entries()) {
    await insert(client, 'group_members', { group_id: dsotmAlbumId, media_item_id: t.id, sort_order: i })
  }

  const wywhAlbumId = id()
  await insert(client, 'groups', { id: wywhAlbumId, library_id: musicLibId, type: 'album', title: 'Wish You Were Here', parent_group_id: pfArtistId, metadata: JSON.stringify({ artist: 'Pink Floyd', year: 1975, label: 'Harvest' }), created_at: ts() })
  for (const [i, t] of wywh.entries()) {
    await insert(client, 'group_members', { group_id: wywhAlbumId, media_item_id: t.id, sort_order: i })
  }

  // Music — Radiohead
  const rhArtistId = id()
  await insert(client, 'groups', { id: rhArtistId, library_id: musicLibId, type: 'artist', title: 'Radiohead', metadata: JSON.stringify({ genre: 'Alternative Rock', country: 'UK', formedYear: 1985 }), created_at: ts() })

  const okAlbumId = id()
  await insert(client, 'groups', { id: okAlbumId, library_id: musicLibId, type: 'album', title: 'OK Computer', parent_group_id: rhArtistId, metadata: JSON.stringify({ artist: 'Radiohead', year: 1997, label: 'Parlophone' }), created_at: ts() })
  for (const [i, t] of okComputer.entries()) {
    await insert(client, 'group_members', { group_id: okAlbumId, media_item_id: t.id, sort_order: i })
  }

  const kidAAlbumId = id()
  await insert(client, 'groups', { id: kidAAlbumId, library_id: musicLibId, type: 'album', title: 'Kid A', parent_group_id: rhArtistId, metadata: JSON.stringify({ artist: 'Radiohead', year: 2000, label: 'Parlophone' }), created_at: ts() })
  for (const [i, t] of kidA.entries()) {
    await insert(client, 'group_members', { group_id: kidAAlbumId, media_item_id: t.id, sort_order: i })
  }

  // Music — Miles Davis
  const mdArtistId = id()
  await insert(client, 'groups', { id: mdArtistId, library_id: musicLibId, type: 'artist', title: 'Miles Davis', metadata: JSON.stringify({ genre: 'Jazz', country: 'US', formedYear: 1944 }), created_at: ts() })

  const kobAlbumId = id()
  await insert(client, 'groups', { id: kobAlbumId, library_id: musicLibId, type: 'album', title: 'Kind of Blue', parent_group_id: mdArtistId, metadata: JSON.stringify({ artist: 'Miles Davis', year: 1959, label: 'Columbia' }), created_at: ts() })
  for (const [i, t] of kindOfBlue.entries()) {
    await insert(client, 'group_members', { group_id: kobAlbumId, media_item_id: t.id, sort_order: i })
  }

  const bbAlbumId = id()
  await insert(client, 'groups', { id: bbAlbumId, library_id: musicLibId, type: 'album', title: 'Bitches Brew', parent_group_id: mdArtistId, metadata: JSON.stringify({ artist: 'Miles Davis', year: 1970, label: 'Columbia' }), created_at: ts() })
  for (const [i, t] of bitchesBrew.entries()) {
    await insert(client, 'group_members', { group_id: bbAlbumId, media_item_id: t.id, sort_order: i })
  }

  // Books — LotR series
  const lotrSeriesId = id()
  await insert(client, 'groups', { id: lotrSeriesId, library_id: booksLibId, type: 'book-series', title: 'The Lord of the Rings', metadata: JSON.stringify({ author: 'J.R.R. Tolkien', totalBooks: 3 }), created_at: ts() })
  for (const [i, b] of [fellowship, twoTowers, returnOfKing].entries()) {
    await insert(client, 'group_members', { group_id: lotrSeriesId, media_item_id: b.id, sort_order: i })
  }

  // Books — Hitchhiker's series
  const hhgSeriesId = id()
  await insert(client, 'groups', { id: hhgSeriesId, library_id: booksLibId, type: 'book-series', title: "The Hitchhiker's Guide to the Galaxy", metadata: JSON.stringify({ author: 'Douglas Adams', totalBooks: 3 }), created_at: ts() })
  for (const [i, b] of [hitchhiker1, hitchhiker2, hitchhiker3].entries()) {
    await insert(client, 'group_members', { group_id: hhgSeriesId, media_item_id: b.id, sort_order: i })
  }

  // Photos — albums
  const vacAlbumId = id()
  await insert(client, 'groups', { id: vacAlbumId, library_id: photosLibId, type: 'album', title: 'Vacation 2023', metadata: JSON.stringify({ location: 'Paris, France', year: 2023 }), created_at: ts() })
  for (const [i, p] of vacPhotos.entries()) {
    await insert(client, 'group_members', { group_id: vacAlbumId, media_item_id: p.id, sort_order: i })
  }

  const famAlbumId = id()
  await insert(client, 'groups', { id: famAlbumId, library_id: photosLibId, type: 'album', title: 'Family Photos', metadata: JSON.stringify({ year: 2024 }), created_at: ts() })
  for (const [i, p] of famPhotos.entries()) {
    await insert(client, 'group_members', { group_id: famAlbumId, media_item_id: p.id, sort_order: i })
  }

  const wildAlbumId = id()
  await insert(client, 'groups', { id: wildAlbumId, library_id: photosLibId, type: 'album', title: 'Wildlife', metadata: JSON.stringify({ location: 'Yellowstone National Park', year: 2024 }), created_at: ts() })
  for (const [i, p] of wildPhotos.entries()) {
    await insert(client, 'group_members', { group_id: wildAlbumId, media_item_id: p.id, sort_order: i })
  }

  // -------------------------------------------------------------------------
  // User activity (alice)
  // -------------------------------------------------------------------------
  console.log('Creating user activity...')

  // Favorites — alice likes a mix of content
  const aliceFaves = [matrix.id, darkKnight.id, shawshank.id, pulpFiction.id, dsotm[4].id, dsotm[2].id, okComputer[1].id, fellowship.id]
  for (const itemId of aliceFaves) {
    await insert(client, 'favorites', { user_id: aliceId, media_item_id: itemId, created_at: ts() })
  }

  // Watchlist — alice has movies queued
  const aliceWatchlist = [interstellar.id, godfather.id, se7en.id, spiritedAway.id, dune.id]
  for (const itemId of aliceWatchlist) {
    await insert(client, 'watchlist', { user_id: aliceId, media_item_id: itemId, created_at: ts() })
  }

  // Favorites — bob
  const bobFaves = [inception.id, toyStory.id, findingNemo.id, kidA[0].id, kindOfBlue[0].id]
  for (const itemId of bobFaves) {
    await insert(client, 'favorites', { user_id: bobId, media_item_id: itemId, created_at: ts() })
  }

  // Media progress — alice has watched/started several items
  const aliceProgress = [
    { itemId: matrix.id, position: 8160, duration: 8160, completed: 1 },       // watched The Matrix fully
    { itemId: inception.id, position: 5400, duration: 8880, completed: 0 },     // halfway through Inception
    { itemId: darkKnight.id, position: 9120, duration: 9120, completed: 1 },    // watched Dark Knight
    { itemId: bbS1[0].id, position: 2700, duration: 2700, completed: 1 },       // watched BB S01E01
    { itemId: bbS1[1].id, position: 1200, duration: 2700, completed: 0 },       // started BB S01E02
    { itemId: dsotm[0].id, position: 231, duration: 231, completed: 1 },        // played Speak to Me
    { itemId: dsotm[1].id, position: 225, duration: 225, completed: 1 },
    { itemId: dsotm[2].id, position: 180, duration: 421, completed: 0 },        // partway through Time
  ]
  for (const p of aliceProgress) {
    await insert(client, 'media_progress', { user_id: aliceId, media_item_id: p.itemId, position: p.position, duration: p.duration, completed: p.completed ? 1 : 0, updated_at: ts() })
  }

  // Media progress — bob
  const bobProgress = [
    { itemId: inception.id, position: 8880, duration: 8880, completed: 1 },
    { itemId: toyStory.id, position: 4860, duration: 4860, completed: 1 },
    { itemId: kindOfBlue[0].id, position: 562, duration: 562, completed: 1 },
    { itemId: kindOfBlue[1].id, position: 300, duration: 585, completed: 0 },
  ]
  for (const p of bobProgress) {
    await insert(client, 'media_progress', { user_id: bobId, media_item_id: p.itemId, position: p.position, duration: p.duration, completed: p.completed ? 1 : 0, updated_at: ts() })
  }

  // Reading position — alice is partway through The Fellowship of the Ring
  await insert(client, 'reading_positions', {
    id: id(),
    media_item_id: fellowship.id,
    cfi: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
    chapter_title: 'A Long-expected Party',
    updated_at: ts(),
  })

  // -------------------------------------------------------------------------
  // Server settings + AI settings
  // -------------------------------------------------------------------------
  await insert(client, 'server_settings', {
    id: id(),
    cors_enabled: 0,
    cors_allowed_origins: '["*"]',
    rate_limit_enabled: 1,
    rate_limit_general: 100,
    rate_limit_auth: 10,
    https_enabled: 0,
    acme_enabled: 0,
    trust_proxy: 0,
    server_port: 32400,
    data_directory: './data',
    thumbnail_sizes: '["small","medium"]',
    log_level: 'info',
    updated_at: ts(),
  })

  await insert(client, 'ai_settings', {
    id: id(),
    ai_enabled: 1,
    ai_mode: 'local-only',
    feature_matching: 1,
    feature_tagging: 1,
    feature_similarity: 1,
    feature_smart_grouping: 1,
    updated_at: ts(),
  })

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const counts = {
    libraries: 5,
    users: 4,
    movies: movieItems.length,
    tvEpisodes: allEpisodes.length,
    musicTracks: allTracks.length,
    books: bookItems.length,
    photos: allPhotos.length,
  }

  console.log('\nSeed complete!')
  console.log(`  Libraries:    ${counts.libraries}`)
  console.log(`  Users:        ${counts.users}  (admin/alice/bob/guest — password same as username)`)
  console.log(`  Movies:       ${counts.movies}`)
  console.log(`  TV episodes:  ${counts.tvEpisodes}  (Breaking Bad, The Office, Planet Earth)`)
  console.log(`  Music tracks: ${counts.musicTracks}  (Pink Floyd, Radiohead, Miles Davis)`)
  console.log(`  Books:        ${counts.books}`)
  console.log(`  Photos:       ${counts.photos}`)
  console.log(`  Total items:  ${counts.movies + counts.tvEpisodes + counts.musicTracks + counts.books + counts.photos}`)

  client.close()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
