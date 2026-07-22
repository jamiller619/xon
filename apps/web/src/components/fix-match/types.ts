export type MatchProviderStatus = 'success' | 'error' | 'unavailable'

export interface MatchProvider {
  id: string
  name: string
  priority: number
  available: boolean
  reason?: string
}

export interface MatchSearchResult {
  id: string
  title: string
  year?: number
  releaseDate?: string
  posterUrl?: string
  mediaKind?: 'movie' | 'series'
  description?: string
}

export interface MatchProviderResults extends MatchProvider {
  status: MatchProviderStatus
  results: MatchSearchResult[]
  error?: string
}

export interface SelectedMatch {
  providerId: string
  matchId: string
}
