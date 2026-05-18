import type { MediaItem } from '@xon/shared'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'

export type UIInjectionPoint =
  | 'dashboard-widget'
  | 'detail-panel'
  | 'admin-page'
  | 'nav-item'
  | 'sidebar:top'
  | 'sidebar:bottom'
  | 'mediaDetail:actions'
  | 'library:toolbar'
  | 'settings:page'

interface PluginUIComponent {
  pluginId: string
  id: string
  injectionPoint: string
  bundleUrl: string
  label?: string
}

export interface PluginComponentProps {
  // mediaItem?: {
  //   id: string
  //   title: string | null
  //   mediaCategory: string | null
  //   libraryId: string | null
  // }
  mediaItem?: Partial<MediaItem>
  libraryId?: string
}

type PluginRenderFn = (
  container: HTMLElement,
  props: PluginComponentProps,
) => () => void

// Module-level cache so all PluginSlot instances share one fetch
let componentsCache: PluginUIComponent[] | null = null
let fetchPromise: Promise<PluginUIComponent[]> | null = null

async function fetchPluginComponents(): Promise<PluginUIComponent[]> {
  if (componentsCache !== null) return componentsCache
  if (!fetchPromise) {
    fetchPromise = apiFetch('/api/v1/plugins/ui-components')
      .then((r) => r.json() as Promise<PluginUIComponent[]>)
      .then((data) => {
        componentsCache = data
        return data
      })
      .catch(() => {
        fetchPromise = null
        return []
      })
  }
  return fetchPromise
}

/** Invalidate the cache (called when plugins change) */
export function invalidatePluginComponentCache(): void {
  componentsCache = null
  fetchPromise = null
}

interface PluginComponentMountProps {
  component: PluginUIComponent
  slotProps: PluginComponentProps
}

function PluginComponentMount({
  component,
  slotProps,
}: PluginComponentMountProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cleanup: (() => void) | undefined
    let cancelled = false

    import(/* @vite-ignore */ component.bundleUrl)
      .then((mod: { default?: PluginRenderFn; render?: PluginRenderFn }) => {
        if (cancelled) return
        const renderFn = mod.default ?? mod.render
        if (typeof renderFn === 'function') {
          cleanup = renderFn(container, slotProps)
        }
      })
      .catch(() => {
        if (!cancelled) {
          container.textContent = `[Plugin ${component.pluginId} failed to load]`
        }
      })

    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [component.bundleUrl, component.pluginId, slotProps])

  return (
    <div
      data-plugin-id={component.pluginId}
      data-component-id={component.id}
      ref={containerRef}
    />
  )
}

interface PluginSlotProps {
  injectionPoint: UIInjectionPoint
  props?: PluginComponentProps
}

export default function PluginSlot({
  injectionPoint,
  props = {},
}: PluginSlotProps) {
  const [components, setComponents] = useState<PluginUIComponent[]>([])

  useEffect(() => {
    fetchPluginComponents().then((all) => {
      setComponents(all.filter((c) => c.injectionPoint === injectionPoint))
    })
  }, [injectionPoint])

  if (components.length === 0) return null

  return (
    <>
      {components.map((c) => (
        <PluginComponentMount key={c.id} component={c} slotProps={props} />
      ))}
    </>
  )
}
