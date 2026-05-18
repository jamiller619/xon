/**
 * In order to generate image URLs, we need a couple pieces
 * of data that is usually obtained from the TMDb API (the
 * /configuration endpoint). Becuase this data never
 * changes, we can cache it for a long time.
 */
export const baseURL = 'http://image.tmdb.org/t/p/'
export const secureBaseURL = 'https://image.tmdb.org/t/p/'
export const backdropSizes = {
  small: 'w300',
  medium: 'w780',
  large: 'w1280',
  original: 'original',
}
export const logoSizes = {
  xxsmall: 'w45',
  xsmall: 'w92',
  small: 'w154',
  medium: 'w185',
  large: 'w300',
  xlarge: 'w500',
  original: 'original',
}
export const posterSizes = {
  xxsmall: 'w92',
  xsmall: 'w154',
  small: 'w185',
  medium: 'w342',
  large: 'w500',
  xlarge: 'w780',
  original: 'original',
}
export const profileSizes = {
  small: 'w45',
  medium: 'w185',
  large: 'h632',
  original: 'original',
}
export const stillSizes = {
  small: 'w92',
  medium: 'w185',
  large: 'w300',
  original: 'original',
}
