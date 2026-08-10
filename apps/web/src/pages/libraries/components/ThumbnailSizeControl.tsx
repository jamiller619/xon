import {
  Grid24Regular as LargeGridIcon,
  Grid16Regular as SmallGridIcon,
} from '@fluentui/react-icons'
import { css } from 'inline-css-modules'
import {
  MAX_THUMBNAIL_SIZE,
  MIN_THUMBNAIL_SIZE,
  THUMBNAIL_SIZE_STEP,
} from '../hooks/useLibraryThumbnailSize'

const styles = css`
  .control {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-height: var(--form-control-height-small);
    padding-inline: var(--space-sm);
    border: 1px solid var(--color-gray-a5);
    border-radius: var(--border-radius-5);
    background: var(--color-gray-2);
    box-shadow: var(--shadow-2);
    color: var(--color-text-muted);
    pointer-events: auto;
  }

  .slider {
    width: 8rem;
    height: var(--space-xs);
    cursor: pointer;
    accent-color: var(--color-accent-9);
  }
`

type ThumbnailSizeControlProps = {
  value: number
  onChange: (value: number) => void
}

export default function ThumbnailSizeControl({
  value,
  onChange,
}: ThumbnailSizeControlProps) {
  return (
    <div className={styles.control} title="Thumbnail size">
      <SmallGridIcon aria-hidden="true" />
      <input
        className={styles.slider}
        type="range"
        aria-label="Thumbnail size"
        aria-valuetext={`${value} pixels`}
        min={MIN_THUMBNAIL_SIZE}
        max={MAX_THUMBNAIL_SIZE}
        step={THUMBNAIL_SIZE_STEP}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <LargeGridIcon aria-hidden="true" />
    </div>
  )
}
