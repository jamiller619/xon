import { describe, expect, it } from 'vitest'
import {
  getDialogHref,
  getDialogName,
  getEditImagesDialogHref,
  getEditImagesTarget,
  getUrlWithoutDialog,
  removeDialogParams,
} from './dialogRoute'

describe('dialog routes', () => {
  it('adds a dialog to the current URL without losing other URL state', () => {
    expect(
      getDialogHref(
        {
          pathname: '/admin/libraries',
          search: '?sort=name&order=desc',
          hash: '#library-list',
        },
        'create-library',
      ),
    ).toBe(
      '/admin/libraries?sort=name&order=desc&dialog=create-library#library-list',
    )
  })

  it('recognizes registered dialogs and ignores unknown values', () => {
    expect(getDialogName(new URLSearchParams('dialog=create-library'))).toBe(
      'create-library',
    )
    expect(getDialogName(new URLSearchParams('dialog=unknown'))).toBeNull()
  })

  it('builds and parses media and library image editor targets', () => {
    expect(
      getEditImagesDialogHref(
        { pathname: '/search', search: '?q=arrival', hash: '' },
        { type: 'media', id: 'media-123' },
      ),
    ).toBe('/search?q=arrival&dialog=edit-images&mediaId=media-123')
    expect(
      getEditImagesTarget(
        new URLSearchParams('dialog=edit-images&mediaId=media-123'),
      ),
    ).toEqual({ type: 'media', id: 'media-123' })
    expect(
      getEditImagesTarget(new URLSearchParams('libraryId=library-456')),
    ).toEqual({ type: 'library', id: 'library-456' })
  })

  it('rejects missing or ambiguous image editor targets', () => {
    expect(getEditImagesTarget(new URLSearchParams())).toBeNull()
    expect(
      getEditImagesTarget(
        new URLSearchParams('mediaId=media-123&libraryId=library-456'),
      ),
    ).toBeNull()
  })

  it('removes only the dialog parameter when a dialog closes', () => {
    const current = new URLSearchParams(
      'sort=name&dialog=create-library&order=desc',
    )

    expect(removeDialogParams(current).toString()).toBe('sort=name&order=desc')
    expect(current.get('dialog')).toBe('create-library')
  })

  it('removes parameters owned by the active dialog', () => {
    expect(
      getUrlWithoutDialog({
        pathname: '/search',
        search: '?q=arrival&dialog=edit-images&mediaId=media-123',
        hash: '#results',
      }),
    ).toBe('/search?q=arrival#results')
  })

  it('cleans up the previous dialog when building a different dialog URL', () => {
    expect(
      getDialogHref(
        {
          pathname: '/search',
          search: '?q=arrival&dialog=edit-images&mediaId=media-123',
          hash: '',
        },
        'create-library',
      ),
    ).toBe('/search?q=arrival&dialog=create-library')
  })

  it('preserves the current path, other parameters, and hash on close', () => {
    expect(
      getUrlWithoutDialog({
        pathname: '/admin/libraries',
        search: '?sort=name&dialog=create-library',
        hash: '#library-list',
      }),
    ).toBe('/admin/libraries?sort=name#library-list')
  })
})
