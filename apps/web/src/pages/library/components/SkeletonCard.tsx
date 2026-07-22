import { css } from 'inline-css-modules'

const styles = css`
  .card {
    aspect-ratio: 2 / 3;
    background: linear-gradient(90deg, #1a1a2e 25%, #222240 50%, #1a1a2e 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--border-radius-3);
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`

export default function SkeletonCard() {
  return <div className={styles.card} />
}
