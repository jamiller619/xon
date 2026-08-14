import type { Library, MediaItem } from '@xon/shared'
import type { MouseEvent } from 'react'
import type { NavigateFunction } from 'react-router-dom'

const POSTER_TRANSITION_CLASS = 'media-poster'

export function mediaPosterTransitionName(id: string): string {
  return `media-poster-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

type StartMediaViewTransitionOptions = {
  event: MouseEvent<HTMLElement>
  item: MediaItem
  navigate: NavigateFunction
  state: MediaItem & { library?: Library | undefined }
  to: string
}

function isPlainLeftClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

function findSourcePoster(link: HTMLElement): HTMLElement | null {
  return (
    link.querySelector<HTMLElement>('img') ??
    link.closest('tr')?.querySelector<HTMLElement>('img') ??
    null
  )
}

function waitForDetailPoster(id: string): Promise<void> {
  return new Promise((resolve) => {
    let timeout = 0

    const observer = new MutationObserver(checkForPoster)

    function checkForPoster() {
      const poster = document.querySelector<HTMLElement>(
        `[data-media-poster-id="${CSS.escape(id)}"]`,
      )
      if (!poster) return

      observer.disconnect()
      window.clearTimeout(timeout)
      resolve()
    }

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-media-poster-id'],
      childList: true,
      subtree: true,
    })
    timeout = window.setTimeout(() => {
      observer.disconnect()
      resolve()
    }, 1500)
    checkForPoster()
  })
}

export function startMediaViewTransition({
  event,
  item,
  navigate,
  state,
  to,
}: StartMediaViewTransitionOptions): void {
  if (
    event.defaultPrevented ||
    !isPlainLeftClick(event) ||
    !document.startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return
  }

  event.preventDefault()

  const sourcePoster = findSourcePoster(event.currentTarget)
  const previousName = sourcePoster?.style.viewTransitionName ?? ''
  const previousClass = sourcePoster?.style.viewTransitionClass ?? ''

  if (sourcePoster) {
    sourcePoster.style.viewTransitionName = mediaPosterTransitionName(item.id)
    sourcePoster.style.viewTransitionClass = POSTER_TRANSITION_CLASS
  }

  const transition = document.startViewTransition(async () => {
    const posterReady = waitForDetailPoster(item.id)
    navigate(to, { state })
    await posterReady
  })

  const cleanup = () => {
    if (!sourcePoster) return
    sourcePoster.style.viewTransitionName = previousName
    sourcePoster.style.viewTransitionClass = previousClass
  }

  void transition.finished.then(cleanup, cleanup)
}
