import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'scheduled' | 'saving' | 'saved' | 'error'

type SaveJob<T> = {
  value: T
  version: number
}

type UseDebouncedAutosaveOptions<T> = {
  delay?: number
  save: (value: T) => Promise<unknown>
}

export default function useDebouncedAutosave<T>({
  delay = 500,
  save,
}: UseDebouncedAutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<Error>()
  const saveRef = useRef(save)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestRef = useRef<SaveJob<T> | undefined>(undefined)
  const readyRef = useRef<SaveJob<T> | undefined>(undefined)
  const failedRef = useRef<SaveJob<T> | undefined>(undefined)
  const activeRef = useRef(false)
  const activeVersionRef = useRef<number | undefined>(undefined)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)
  const drainRef = useRef<() => Promise<void>>(async () => undefined)

  saveRef.current = save

  const setVisibleStatus = useCallback((next: AutosaveStatus) => {
    if (mountedRef.current) setStatus(next)
  }, [])

  const drain = useCallback(async () => {
    if (activeRef.current || !readyRef.current) return

    const job = readyRef.current
    readyRef.current = undefined
    activeRef.current = true
    activeVersionRef.current = job.version
    setVisibleStatus('saving')

    try {
      await saveRef.current(job.value)
      if (job.version === versionRef.current) {
        latestRef.current = undefined
        failedRef.current = undefined
        if (mountedRef.current) setError(undefined)
        setVisibleStatus('saved')
      }
    } catch (cause) {
      if (job.version === versionRef.current) {
        failedRef.current = job
        if (mountedRef.current) {
          setError(
            cause instanceof Error ? cause : new Error('Value could not save'),
          )
        }
        setVisibleStatus('error')
      }
    } finally {
      activeRef.current = false
      activeVersionRef.current = undefined
      if (readyRef.current) void drainRef.current()
    }
  }, [setVisibleStatus])

  drainRef.current = drain

  const readyLatest = useCallback(() => {
    if (!latestRef.current) return
    if (latestRef.current.version === activeVersionRef.current) return
    readyRef.current = latestRef.current
    void drainRef.current()
  }, [])

  const schedule = useCallback(
    (value: T) => {
      versionRef.current += 1
      const job = { value, version: versionRef.current }
      latestRef.current = job
      failedRef.current = undefined
      if (mountedRef.current) setError(undefined)
      setVisibleStatus('scheduled')

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined
        readyLatest()
      }, delay)
    },
    [delay, readyLatest, setVisibleStatus],
  )

  const saveNow = useCallback(
    (value: T) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = undefined
      versionRef.current += 1
      const job = { value, version: versionRef.current }
      latestRef.current = job
      readyRef.current = job
      failedRef.current = undefined
      if (mountedRef.current) setError(undefined)
      setVisibleStatus('scheduled')
      void drainRef.current()
    },
    [setVisibleStatus],
  )

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    readyLatest()
  }, [readyLatest])

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = undefined
    versionRef.current += 1
    latestRef.current = undefined
    readyRef.current = undefined
    failedRef.current = undefined
    if (mountedRef.current) setError(undefined)
    setVisibleStatus('idle')
  }, [setVisibleStatus])

  const retry = useCallback(() => {
    const failed = failedRef.current
    if (!failed) return
    saveNow(failed.value)
  }, [saveNow])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = undefined
      mountedRef.current = false
      readyLatest()
    }
  }, [readyLatest])

  return { cancel, error, flush, retry, saveNow, schedule, status }
}
