import {
  type ComponentType,
  type LazyExoticComponent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  APP_DIALOGS,
  type AppDialog,
  getDialogName,
  getUrlWithoutDialog,
} from './dialogRoute'

type RoutedDialogProps = {
  onClose: () => void
}

type RoutedDialogModule = {
  default: ComponentType<RoutedDialogProps>
}

// Keep every dialog behind a dynamic import so dialog-only code does not delay
// the initial page bundle. The imports are started later, after the page has
// loaded, but a direct dialog URL can still start its import immediately.
const dialogImports: Record<AppDialog, () => Promise<RoutedDialogModule>> = {
  'create-library': () => import('./dialogs/CreateLibraryDialog'),
  'edit-images': () => import('./dialogs/EditImagesDialog'),
}

// React.lazy and the background preloader both call loadDialog. Caching the
// import promise means they share an in-flight download instead of requesting
// the same chunk twice. A rejected preload is removed so a later open can retry.
const dialogModules = new Map<AppDialog, Promise<RoutedDialogModule>>()

function loadDialog(dialog: AppDialog): Promise<RoutedDialogModule> {
  const cached = dialogModules.get(dialog)
  if (cached) return cached

  const pending = dialogImports[dialog]().catch((error: unknown) => {
    dialogModules.delete(dialog)
    throw error
  })
  dialogModules.set(dialog, pending)
  return pending
}

function preloadDialogs() {
  for (const dialog of APP_DIALOGS) {
    void loadDialog(dialog).catch(() => undefined)
  }
}

const CreateLibraryDialog = lazy(() => loadDialog('create-library'))
const EditImagesDialog = lazy(() => loadDialog('edit-images'))

const dialogs: Record<
  AppDialog,
  LazyExoticComponent<ComponentType<RoutedDialogProps>>
> = {
  'create-library': CreateLibraryDialog,
  'edit-images': EditImagesDialog,
}

export default function DialogRouter() {
  const location = useLocation()
  const navigate = useNavigate()
  const dialogName = getDialogName(new URLSearchParams(location.search))
  const closeDialog = useCallback(() => {
    void navigate(getUrlWithoutDialog(location), { replace: true })
  }, [location, navigate])

  useEffect(() => {
    let idleHandle: number | undefined
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined

    function schedulePreload() {
      // requestIdleCallback keeps dialog downloads and module evaluation out of
      // the page's critical loading work. The timeout guarantees they still
      // preload if the browser remains busy, and the timer fallback covers
      // browsers without requestIdleCallback.
      if ('requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(preloadDialogs, {
          timeout: 2_000,
        })
      } else {
        timeoutHandle = globalThis.setTimeout(preloadDialogs, 0)
      }
    }

    // Waiting for load ensures the document and its critical resources get
    // priority. If this component mounts after load, schedule immediately and
    // still let requestIdleCallback choose the actual preload moment.
    if (document.readyState === 'complete') schedulePreload()
    else window.addEventListener('load', schedulePreload, { once: true })

    return () => {
      window.removeEventListener('load', schedulePreload)
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle)
      if (timeoutHandle !== undefined) globalThis.clearTimeout(timeoutHandle)
    }
  }, [])

  if (dialogName === null) return null

  const ActiveDialog = dialogs[dialogName]

  return (
    <Suspense fallback={null}>
      <ActiveDialog onClose={closeDialog} />
    </Suspense>
  )
}
