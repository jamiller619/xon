import type { CastMember } from '@xon/shared'
import { Flex, XScroller } from '@xon/ui'
import { css } from 'inline-css-modules'
import mediaStyles from '../Media.module.css'

const styles = css`
  .castList {
    gap: var(--space-md);
  }

  .castImage {
    border-radius: var(--border-radius-4);
    corner-shape: var(--corner-shape);
    overflow: hidden;
    line-height: 0;
    width: var(--space-4xl);

    img {
      object-fit: cover;
      aspect-ratio: 3 / 5;
    }
  }

  .castName {
    line-height: 1.2;
    margin-block: var(--space-xs);
  }

  .castRole {
    display: inline-block;
    color: var(--color-text-muted);
    line-height: 1.2;
  }
`

export default function Cast({ data }: { data?: CastMember[] | undefined }) {
  return (
    data && (
      <XScroller>
        <Flex dir="col" gap="4">
          <Flex justify="between" align="center">
            <h2 className={mediaStyles.heading}>Cast</h2>
            <Flex gap="4">
              <XScroller.ButtonPrev />
              <XScroller.ButtonNext />
            </Flex>
          </Flex>
          <XScroller.Viewport className={styles.castList}>
            {data.map((c) => (
              <div key={c.id}>
                <div className={styles.castImage}>
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt={c.name} />
                  ) : (
                    <img
                      src={`https://api.dicebear.com/10.x/dylan/svg?seed=${c.name}-${c.role}`}
                      alt="avatar"
                    />
                  )}
                </div>
                <div className={styles.castName}>{c.name}</div>
                <span className={styles.castRole}>as {c.role}</span>
              </div>
            ))}
          </XScroller.Viewport>
        </Flex>
      </XScroller>
    )
  )
}
