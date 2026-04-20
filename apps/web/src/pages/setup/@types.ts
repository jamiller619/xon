export type StepProps = {
  setStep: (step: number) => void
  isLoading: boolean
  setLoading: (loading: boolean) => void
  hasError: string | null
  setError: (error: string | null) => void
}
