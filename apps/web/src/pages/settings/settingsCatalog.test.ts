import { describe, expect, it } from 'vitest'
import {
  createSettingsCatalog,
  settingMatchesQuery,
  settingsCatalog,
  validateSettingValue,
} from './settingsCatalog'

describe('settings catalog', () => {
  it('preserves every core setting and configured category order', () => {
    expect(settingsCatalog.map((category) => category.namespace)).toEqual([
      'app',
      'log',
      'appdata',
      'network',
      'session',
    ])
    expect(
      settingsCatalog.flatMap((category) => category.settings),
    ).toHaveLength(19)
  })

  it('derives the right controls and nested subgroup', () => {
    const settings = settingsCatalog.flatMap((category) => category.settings)

    expect(
      settings.find((setting) => setting.key === 'log.level')?.control,
    ).toBe('enum')
    expect(
      settings.find(
        (setting) => setting.key === 'network.security.corsAllowedOrigins',
      ),
    ).toMatchObject({ control: 'string-list', subgroupTitle: 'Security' })
    expect(
      settings.find((setting) => setting.key === 'app.locale'),
    ).toMatchObject({ readOnly: true, required: true })
  })

  it('searches human labels, descriptions, keys, and enum values', () => {
    const logging = settingsCatalog[1]?.settings ?? []
    const level = logging.find((setting) => setting.key === 'log.level')

    expect(level && settingMatchesQuery(level, 'logger')).toBe(true)
    expect(level && settingMatchesQuery(level, 'log.level')).toBe(true)
    expect(level && settingMatchesQuery(level, 'warn')).toBe(true)
    expect(level && settingMatchesQuery(level, 'certificate')).toBe(false)
  })

  it('validates numeric schema constraints', () => {
    const retention = settingsCatalog
      .flatMap((category) => category.settings)
      .find((setting) => setting.key === 'log.retentionDays')

    expect(retention).toBeDefined()
    if (!retention) return

    expect(validateSettingValue(retention, 0)).toBe('Enter 1 or greater.')
    expect(validateSettingValue(retention, 1.5)).toBe('Enter a whole number.')
    expect(validateSettingValue(retention, 30)).toBeUndefined()
  })

  it('keeps unknown schema shapes visible as unsupported', () => {
    const [category] = createSettingsCatalog({
      properties: {
        'future.setting': { type: 'object', title: 'Future setting' },
      },
    })

    expect(category?.settings[0]?.control).toBe('unsupported')
  })
})
