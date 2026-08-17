import { Skeleton } from '@xon/ui'
import clsx from 'clsx'
import type { ComponentPropsWithoutRef, ReactNode, SyntheticEvent } from 'react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import styles from './ArtworkImage.module.css'

type SettledImage = {
  src: string
  state: 'loaded' | 'error'
}

export type ArtworkImageProps = Omit<
  ComponentPropsWithoutRef<'img'>,
  'src' | 'alt'
> & {
  alt: string
  src?: string | null | undefined
  fallback?: ReactNode
  containerClassName?: string | undefined
}

export default function ArtworkImage({
  src,
  alt,
  fallback,
  containerClassName,
  className,
  decoding = 'async',
  onLoad,
  onError,
  ...imageProps
}: ArtworkImageProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [settledImage, setSettledImage] = useState<SettledImage | null>(null)
  const state = !src
    ? 'empty'
    : settledImage?.src === src
      ? settledImage.state
      : 'loading'

  const revealImage = useCallback(
    async (image: HTMLImageElement, url: string) => {
      try {
        await image.decode()
      } catch {
        // A successful load is still usable when decode() is unsupported or
        // rejects after the browser has already decoded enough to render it.
      }

      if (imageRef.current !== image || image.getAttribute('src') !== url)
        return

      setSettledImage({
        src: url,
        state: image.naturalWidth > 0 ? 'loaded' : 'error',
      })
    },
    [],
  )

  useLayoutEffect(() => {
    const image = imageRef.current
    if (!src || !image?.complete) return

    if (image.naturalWidth === 0) {
      setSettledImage({ src, state: 'error' })
      return
    }

    void revealImage(image, src)
  }, [revealImage, src])

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    onLoad?.(event)
    if (src) void revealImage(event.currentTarget, src)
  }

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    onError?.(event)
    if (src && event.currentTarget.getAttribute('src') === src) {
      setSettledImage({ src, state: 'error' })
    }
  }

  return (
    <div
      className={clsx(styles.artwork, containerClassName)}
      data-state={state}
      aria-busy={state === 'loading' || undefined}
    >
      {src && (
        <>
          <Skeleton className={styles.skeleton} />
          <img
            {...imageProps}
            ref={imageRef}
            src={src}
            alt={alt}
            className={clsx(styles.image, className)}
            decoding={decoding}
            onLoad={handleLoad}
            onError={handleError}
          />
        </>
      )}
      {(state === 'empty' || state === 'error') && fallback && (
        <div className={styles.fallback}>{fallback}</div>
      )}
    </div>
  )
}
