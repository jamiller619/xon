// Ambient types for Intl.DurationFormat (ECMA-402 Stage 4).
// TypeScript doesn't ship these yet: https://github.com/microsoft/TypeScript/issues/60608
// Remove once they land in lib.esnext.intl.d.ts.

declare namespace Intl {
  type DurationUnitStyle = 'long' | 'short' | 'narrow'
  type DurationTimeUnitStyle = DurationUnitStyle | 'numeric' | '2-digit'
  type DurationSubsecondUnitStyle = DurationUnitStyle | 'numeric'
  type DurationUnitDisplay = 'auto' | 'always'

  interface DurationFormatOptions {
    localeMatcher?: 'lookup' | 'best fit'
    numberingSystem?: string
    style?: 'long' | 'short' | 'narrow' | 'digital'
    years?: DurationUnitStyle
    yearsDisplay?: DurationUnitDisplay
    months?: DurationUnitStyle
    monthsDisplay?: DurationUnitDisplay
    weeks?: DurationUnitStyle
    weeksDisplay?: DurationUnitDisplay
    days?: DurationUnitStyle
    daysDisplay?: DurationUnitDisplay
    hours?: DurationTimeUnitStyle
    hoursDisplay?: DurationUnitDisplay
    minutes?: DurationTimeUnitStyle
    minutesDisplay?: DurationUnitDisplay
    seconds?: DurationTimeUnitStyle
    secondsDisplay?: DurationUnitDisplay
    milliseconds?: DurationSubsecondUnitStyle
    millisecondsDisplay?: DurationUnitDisplay
    microseconds?: DurationSubsecondUnitStyle
    microsecondsDisplay?: DurationUnitDisplay
    nanoseconds?: DurationSubsecondUnitStyle
    nanosecondsDisplay?: DurationUnitDisplay
    fractionalDigits?: number
  }

  interface ResolvedDurationFormatOptions
    extends Required<Omit<DurationFormatOptions, 'localeMatcher' | 'fractionalDigits'>> {
    locale: string
    fractionalDigits?: number
  }

  interface Duration {
    years?: number
    months?: number
    weeks?: number
    days?: number
    hours?: number
    minutes?: number
    seconds?: number
    milliseconds?: number
    microseconds?: number
    nanoseconds?: number
  }

  interface DurationFormatPart {
    type: string
    value: string
    unit?: string
  }

  class DurationFormat {
    constructor(locales?: string | string[], options?: DurationFormatOptions)
    format(duration: Duration): string
    formatToParts(duration: Duration): DurationFormatPart[]
    resolvedOptions(): ResolvedDurationFormatOptions
    static supportedLocalesOf(
      locales?: string | string[],
      options?: Pick<DurationFormatOptions, 'localeMatcher'>
    ): string[]
  }
}
