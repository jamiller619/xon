export const DIALOG_PARAM = 'dialog'

export const APP_DIALOGS = ['create-library', 'edit-images'] as const

export type AppDialog = (typeof APP_DIALOGS)[number]
type ParameterlessDialog = Exclude<AppDialog, 'edit-images'>

export type EditImagesTarget =
  | { type: 'media'; id: string }
  | { type: 'library'; id: string }

const DIALOG_SEARCH_PARAMS: Record<AppDialog, readonly string[]> = {
  'create-library': [],
  'edit-images': ['mediaId', 'libraryId'],
}

type DialogLocation = {
  pathname: string
  search: string
  hash: string
}

export function getDialogName(searchParams: URLSearchParams): AppDialog | null {
  const dialog = searchParams.get(DIALOG_PARAM)

  return APP_DIALOGS.find((candidate) => candidate === dialog) ?? null
}

export function getDialogHref(
  location: DialogLocation,
  dialog: ParameterlessDialog,
): string {
  const searchParams = removeDialogParams(new URLSearchParams(location.search))
  searchParams.set(DIALOG_PARAM, dialog)

  return `${location.pathname}?${searchParams.toString()}${location.hash}`
}

export function getEditImagesDialogHref(
  location: DialogLocation,
  target: EditImagesTarget,
): string {
  const searchParams = removeDialogParams(new URLSearchParams(location.search))
  searchParams.set(DIALOG_PARAM, 'edit-images')
  searchParams.set(target.type === 'media' ? 'mediaId' : 'libraryId', target.id)

  return `${location.pathname}?${searchParams.toString()}${location.hash}`
}

export function getEditImagesTarget(
  searchParams: URLSearchParams,
): EditImagesTarget | null {
  const mediaId = searchParams.get('mediaId')?.trim()
  const libraryId = searchParams.get('libraryId')?.trim()

  if (mediaId && !libraryId) return { type: 'media', id: mediaId }
  if (libraryId && !mediaId) return { type: 'library', id: libraryId }
  return null
}

export function removeDialogParams(
  searchParams: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(searchParams)
  const dialog = getDialogName(next)

  if (dialog !== null) {
    for (const parameter of DIALOG_SEARCH_PARAMS[dialog]) {
      next.delete(parameter)
    }
  }

  next.delete(DIALOG_PARAM)
  return next
}

export function getUrlWithoutDialog(location: DialogLocation): string {
  const searchParams = removeDialogParams(new URLSearchParams(location.search))
  const search = searchParams.size > 0 ? `?${searchParams.toString()}` : ''

  return `${location.pathname}${search}${location.hash}`
}
