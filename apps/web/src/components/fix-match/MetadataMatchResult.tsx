import { Badge, Button, Flex } from '@xon/ui'
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
          {result.posterUrl ? (
            <img src={result.posterUrl} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">▶</span>
          )}
        </div>
        <Flex dir="col" gap="1" align="start" className={styles.resultText}>
          <strong>{result.title}</strong>
          <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
            {result.year != null && <Badge size="small">{result.year}</Badge>}
            {result.mediaKind && <Badge size="small">{result.mediaKind}</Badge>}
          </Flex>
          {result.description && <span>{result.description}</span>}
        </Flex>
      </Flex>
    </Button>
  )
}
