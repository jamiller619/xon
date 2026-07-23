import { ConfirmationDialog } from '@xon/ui'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

type ConfirmationRequest = {
  onYes: () => void
  onNo?: () => void
  title?: string
  description?: ReactNode
}

type ConfirmationOptions = {
  onNo?: () => void
  title?: string
  description?: ReactNode
}

type Confirm = (onYes: () => void, options?: ConfirmationOptions) => void

const ConfirmationContext = createContext<Confirm | null>(null)

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest>()

  const confirm = useCallback<Confirm>((onYes, options) => {
    setRequest({
      onYes,
      ...(options?.onNo ? { onNo: options.onNo } : {}),
      ...(options?.title ? { title: options.title } : {}),
      ...(options?.description != null
        ? { description: options.description }
        : {}),
    })
  }, [])

  const contextValue = useMemo(() => confirm, [confirm])

  function handleYes() {
    const action = request?.onYes
    setRequest(undefined)
    action?.()
  }

  function handleNo() {
    const action = request?.onNo
    setRequest(undefined)
    action?.()
  }

  return (
    <ConfirmationContext.Provider value={contextValue}>
      {children}
      <ConfirmationDialog
        open={request != null}
        {...(request?.title ? { title: request.title } : {})}
        {...(request?.description != null
          ? { description: request.description }
          : {})}
        onYes={handleYes}
        onNo={handleNo}
      />
    </ConfirmationContext.Provider>
  )
}

export function useConfirmation(): Confirm {
  const confirm = useContext(ConfirmationContext)
  if (!confirm) {
    throw new Error('useConfirmation must be used inside ConfirmationProvider')
  }
  return confirm
}

export function useRefreshMetadataConfirmation(): (onYes: () => void) => void {
  const confirm = useConfirmation()

  return useCallback(
    (onYes) =>
      confirm(onYes, {
        title: 'Refresh metadata?',
        description: (
          <>
            This will <strong>replace all</strong> metadata using the configured
            providers!
            <br />
            Are you sure?
          </>
        ),
      }),
    [confirm],
  )
}
