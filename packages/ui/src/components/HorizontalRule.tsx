import { css } from 'inline-css-modules'

const styles = css`
  .container {
    display: flex;
    align-items: center;
    text-align: center;

    &::before,
    &::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid var(--color-gray-6);
    }

    &:not(:empty)::before {
      margin-right: 1rem;
    }

    &:not(:empty)::after {
      margin-left: 1rem;
    }
  }
`

export default function HorizontalRule({ children }: { children?: string }) {
  return <div className={styles.container}>{children}</div>
}
