import { describe, expect, it } from 'vitest'
import { calculateResponsivePageSize } from './useResponsivePageSize'

describe('calculateResponsivePageSize', () => {
  it('fills every fitting grid row', () => {
    expect(
      calculateResponsivePageSize({
        availableHeight: 884,
        columns: 7,
        rowGap: 12,
        rowHeight: 280,
      }),
    ).toBe(21)
  })

  it('subtracts non-item content such as a table header', () => {
    expect(
      calculateResponsivePageSize({
        availableHeight: 260,
        columns: 1,
        headerHeight: 40,
        minPageSize: 1,
        rowGap: 0,
        rowHeight: 44,
      }),
    ).toBe(5)
  })

  it('always requests at least one item', () => {
    expect(
      calculateResponsivePageSize({
        availableHeight: 0,
        columns: 0,
        minPageSize: 1,
        rowGap: 12,
        rowHeight: 280,
      }),
    ).toBe(1)
  })

  it('keeps the established page density when the viewport is short', () => {
    expect(
      calculateResponsivePageSize({
        availableHeight: 580,
        columns: 7,
        rowGap: 12,
        rowHeight: 280,
      }),
    ).toBe(21)
  })

  it('respects the API limit without creating a partial grid row', () => {
    expect(
      calculateResponsivePageSize({
        availableHeight: 10_000,
        columns: 7,
        maxPageSize: 100,
        rowGap: 12,
        rowHeight: 280,
      }),
    ).toBe(98)
  })
})
