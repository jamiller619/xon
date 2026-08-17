import { Button, Chip, Flex } from '@xon/ui'
import ArtworkImage from '../ArtworkImage'
import styles from './FixMatchDialog.module.css'
import type { MatchSearchResult } from './types'

interface MetadataMatchResultProps {
  result: MatchSearchResult
  selected: boolean
  onSelect: () => void
}

export default function MetadataMatchResult({
  result,
  selected,
  onSelect,
}: MetadataMatchResultProps) {
  return (
    <Button
      className={styles.result}
      variant={selected ? 'primary' : undefined}
      onClick={onSelect}
      borderRadius="small"
      aria-pressed={selected}
    >
      <Flex gap="3" align="center">
        <div className={styles.resultPoster}>
          <ArtworkImage
            src={result.posterUrl}
            alt=""
            loading="lazy"
            fallback={<span aria-hidden="true">▶</span>}
          />
        </div>
        <Flex dir="col" gap="1" align="start" className={styles.resultText}>
          <strong>{result.title}</strong>
          <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
            {result.year != null && <Chip size="small">{result.year}</Chip>}
            {result.mediaKind && <Chip size="small">{result.mediaKind}</Chip>}
          </Flex>
          {result.description && <span>{result.description}</span>}
        </Flex>
      </Flex>
    </Button>
  )
}
