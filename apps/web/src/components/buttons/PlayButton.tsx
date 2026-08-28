import { Button, type ButtonProps } from '@xon/ui'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { PlayIcon } from '../icons/playback'

const styles = css`
  button.button {
    gap: var(--space-2xs);
  }
`

export default function PlayButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      {...props}
      className={clsx(styles.button, className)}
      variant="primary"
      aria-label="Play"
    >
      <PlayIcon />
      <span>Play</span>
    </Button>
  )
}
