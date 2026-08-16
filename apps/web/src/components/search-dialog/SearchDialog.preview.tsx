import type { MediaItem } from '@xon/shared'
import { css } from 'inline-css-modules'
import { MemoryRouter } from 'react-router-dom'
import SearchDialog, { type SearchDialogVisualState } from './SearchDialog'

const styles = css`
  /* Hallmark · component preview: search palette states · theme: Xon */
  .preview {
    display: grid;
    gap: var(--space-xl);
    max-width: 48rem;
    padding: var(--space-xl);
    margin-inline: auto;
    color: var(--color-gray-12);
  }

  .state {
    display: grid;
    gap: var(--space-xs);
  }

  .label {
    margin: 0;
    color: var(--color-gray-10);
    font-size: var(--text-sm);
    font-weight: 700;
    text-transform: capitalize;
  }
`

const STATES: SearchDialogVisualState[] = [
  'default',
  'hover',
  'focus',
  'active',
  'disabled',
  'loading',
  'error',
  'success',
]

const PREVIEW_RESULT: MediaItem = {
  id: 'search-preview-result',
  libraryId: 'search-preview-library',
  dataSourceId: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: null,
  filePath: '/preview/result.mkv',
  fileSize: 0,
  fileMetadata: {},
  mediaType: 'video/x-matroska',
  matchId: null,
  matchIdSource: null,
  title: 'Search result preview',
  description: null,
  metadata: { releaseDate: '2024', genres: ['Drama'] },
  drmProtected: false,
  scannedAt: new Date('2024-01-01T00:00:00Z'),
  tags: [],
}

export default function SearchDialogPreview() {
  return (
    <MemoryRouter>
      <main className={styles.preview}>
        {STATES.map((state) => (
          <section key={state} className={styles.state}>
            <h2 className={styles.label}>{state}</h2>
            <SearchDialog
              preview
              visualState={state}
              initialQuery={state === 'default' ? '' : 'Search'}
              initialResults={state === 'success' ? [PREVIEW_RESULT] : []}
              initialGenres={['Drama', 'Comedy', 'Science Fiction']}
            />
          </section>
        ))}
      </main>
    </MemoryRouter>
  )
}
