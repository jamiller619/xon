import { Search20Regular } from '@fluentui/react-icons'
import type { ConfigKey } from '@xon/shared'
import { Button, Field, Select, Skeleton, Textbox } from '@xon/ui'
import {
  type CSSProperties,
  Fragment,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useResizeObserver } from 'usehooks-ts'
import Eyebrow from '~/components/Eyebrow'
import { useConfigQuery } from '~/hooks/useConfig'
import type { AutosaveStatus } from '~/hooks/useDebouncedAutosave'
import Page from '~/pages/Page'
import SettingControl from './SettingControl'
import styles from './Settings.module.css'
import {
  type SettingsCategory,
  settingMatchesQuery,
  settingsCatalog,
} from './settingsCatalog'

const ALL_SETTINGS = 'all'
const NAV_SKELETONS = ['all', 'app', 'log', 'appdata', 'network', 'session']
const SETTING_SKELETONS = ['one', 'two', 'three', 'four', 'five']

function SettingsSkeleton() {
  return (
    <div
      className={styles.skeletonLayout}
      aria-label="Loading settings"
      role="status"
    >
      <div className={styles.skeletonRail}>
        {NAV_SKELETONS.map((key) => (
          <Skeleton className={styles.skeletonNav} key={key} />
        ))}
      </div>
      <div className={styles.skeletonSettings}>
        {SETTING_SKELETONS.map((key) => (
          <div className={styles.skeletonSetting} key={key}>
            <Skeleton className={styles.skeletonTitle} />
            <Skeleton className={styles.skeletonDescription} />
            <Skeleton className={styles.skeletonControl} />
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryNav({
  selected,
  onChange,
}: {
  selected: string
  onChange: (namespace: string) => void
}) {
  return (
    <>
      <nav className={styles.categoryRail} aria-label="Settings categories">
        <Button
          aria-current={selected === ALL_SETTINGS ? 'page' : undefined}
          className={styles.categoryButton}
          variant="link"
          block
          onClick={() => onChange(ALL_SETTINGS)}
        >
          All settings
        </Button>
        {settingsCatalog.map((category) => (
          <Button
            aria-current={selected === category.namespace ? 'page' : undefined}
            className={styles.categoryButton}
            key={category.namespace}
            variant="link"
            block
            onClick={() => onChange(category.namespace)}
          >
            {category.title}
          </Button>
        ))}
      </nav>

      <Field className={styles.categorySelect} label="Settings category">
        <Select
          block
          value={selected}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value={ALL_SETTINGS}>All settings</option>
          {settingsCatalog.map((category) => (
            <option value={category.namespace} key={category.namespace}>
              {category.title}
            </option>
          ))}
        </Select>
      </Field>
    </>
  )
}

export default function Settings() {
  const headerRef = useRef<HTMLElement>(null)
  const { height: headerHeight } = useResizeObserver({
    ref: headerRef as RefObject<HTMLElement>,
    box: 'border-box',
  })
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_SETTINGS)
  const [saveStatuses, setSaveStatuses] = useState<
    Partial<Record<ConfigKey, AutosaveStatus>>
  >({})
  const { data: config, error, isPending, refetch } = useConfigQuery()

  const visibleCategories = useMemo(() => {
    const categories =
      selectedCategory === ALL_SETTINGS
        ? settingsCatalog
        : settingsCatalog.filter(
            (category) => category.namespace === selectedCategory,
          )

    return categories
      .map((category) => ({
        ...category,
        settings: category.settings.filter((setting) =>
          settingMatchesQuery(setting, query),
        ),
      }))
      .filter((category) => category.settings.length > 0)
  }, [query, selectedCategory])

  const visibleSettings = visibleCategories.flatMap(
    (category) => category.settings,
  )
  const stripedSettingKeys = new Set(
    visibleSettings
      .filter((_, index) => index % 2 === 0)
      .map((setting) => setting.key),
  )
  const visibleKeys = new Set(visibleSettings.map((setting) => setting.key))
  const visibleStatuses = Object.entries(saveStatuses)
    .filter(([key]) => visibleKeys.has(key as ConfigKey))
    .map(([, status]) => status)
  const liveStatus = visibleStatuses.includes('error')
    ? 'Some changes were not saved'
    : visibleStatuses.some(
          (status) => status === 'saving' || status === 'scheduled',
        )
      ? 'Saving changes'
      : visibleStatuses.includes('saved')
        ? 'All changes saved'
        : ''

  const onStatusChange = useCallback(
    (key: ConfigKey, status: AutosaveStatus) => {
      setSaveStatuses((current) =>
        current[key] === status ? current : { ...current, [key]: status },
      )
    },
    [],
  )

  const selectedTitle =
    selectedCategory === ALL_SETTINGS
      ? 'All settings'
      : (settingsCatalog.find(
          (category) => category.namespace === selectedCategory,
        )?.title ?? 'Settings')

  const pageStyle =
    headerHeight === undefined
      ? undefined
      : ({ '--settings-header-height': `${headerHeight}px` } as CSSProperties)

  return (
    <Page className={styles.page} style={pageStyle}>
      <header className={styles.header} ref={headerRef}>
        <div className={styles.headerSummary}>
          <div>
            <Page.Title>Settings</Page.Title>
            <p className={styles.intro}>
              Search and edit the core values stored in Xon&apos;s config file.
              Valid changes save automatically.
            </p>
          </div>
          <p className={styles.liveStatus} aria-live="polite" role="status">
            {liveStatus}
          </p>
        </div>

        <Field
          className={styles.searchField}
          label={<span className={styles.visuallyHidden}>Search settings</span>}
        >
          <Textbox
            aria-label="Search settings"
            block
            placeholder="Search settings"
            startIcon={<Search20Regular aria-hidden="true" />}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </Field>
      </header>

      {isPending ? (
        <SettingsSkeleton />
      ) : error || !config ? (
        <section className={styles.loadError} role="alert">
          <h2>Settings could not be loaded</h2>
          <p>{error?.message ?? 'The server returned no configuration.'}</p>
          <Button onClick={() => void refetch()}>Retry</Button>
        </section>
      ) : (
        <div className={styles.workbench}>
          <CategoryNav
            selected={selectedCategory}
            onChange={setSelectedCategory}
          />

          <main className={styles.results}>
            <div className={styles.resultsHeader}>
              <Eyebrow>{selectedTitle}</Eyebrow>
              <span>
                {visibleSettings.length}{' '}
                {visibleSettings.length === 1 ? 'setting' : 'settings'}
              </span>
            </div>

            {visibleCategories.length === 0 ? (
              <section className={styles.empty}>
                <h3>No settings found</h3>
                <p>
                  No settings in {selectedTitle.toLocaleLowerCase()} match
                  &ldquo;{query.trim()}&rdquo;.
                </p>
                <Button onClick={() => setQuery('')}>Clear search</Button>
              </section>
            ) : (
              visibleCategories.map((category) => (
                <SettingsSection
                  category={category}
                  config={config}
                  key={category.namespace}
                  showHeading={selectedCategory === ALL_SETTINGS}
                  stripedSettingKeys={stripedSettingKeys}
                  onStatusChange={onStatusChange}
                />
              ))
            )}
          </main>
        </div>
      )}
    </Page>
  )
}

function SettingsSection({
  category,
  config,
  showHeading,
  stripedSettingKeys,
  onStatusChange,
}: {
  category: SettingsCategory
  config: NonNullable<ReturnType<typeof useConfigQuery>['data']>
  showHeading: boolean
  stripedSettingKeys: ReadonlySet<ConfigKey>
  onStatusChange: (key: ConfigKey, status: AutosaveStatus) => void
}) {
  let lastSubgroup: string | undefined

  return (
    <section className={styles.categorySection}>
      {showHeading && (
        <Eyebrow className={styles.categoryHeading}>{category.title}</Eyebrow>
      )}
      {category.settings.map((setting) => {
        const showSubgroup =
          setting.subgroupTitle !== undefined &&
          setting.subgroupTitle !== lastSubgroup
        lastSubgroup = setting.subgroupTitle

        return (
          <Fragment key={setting.key}>
            {showSubgroup && (
              <p className={styles.subgroupHeading}>{setting.subgroupTitle}</p>
            )}
            <SettingControl
              definition={setting}
              striped={stripedSettingKeys.has(setting.key)}
              value={config[setting.key]}
              onStatusChange={onStatusChange}
            />
          </Fragment>
        )
      })}
    </section>
  )
}
