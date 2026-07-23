import { Switch as UISwitch } from '@base-ui/react'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'
import Label from '../Label.jsx'

const styles = css`
  .label {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: var(--space-xs);
    min-height: calc(var(--space-xl) + var(--space-sm));
    cursor: pointer;
    user-select: none;

    &:has(.root[data-disabled]) {
      cursor: not-allowed;
    }
  }

  .root {
    --switch-duration: 120ms;
    --switch-easing: cubic-bezier(0.65, 0, 0.35, 1);

    display: inline-flex;
    flex: none;
    align-items: center;
    width: var(--space-2xl);
    height: calc(var(--space-lg) + var(--space-2xs));
    border-radius: var(--border-radius-5);
    padding: var(--space-3xs);
    background-color: var(--color-gray-5);
    color: var(--color-text);
    cursor: pointer;
    transition:
      background-color var(--switch-duration) var(--switch-easing),
      border-color var(--switch-duration) var(--switch-easing),
      opacity var(--switch-duration) var(--switch-easing);

    &[data-checked] {
      border-color: var(--color-accent-9);
      background-color: var(--color-accent-9);
    }

    &:focus-visible,
    &[data-preview-state="focus"] {
      outline: 2px solid var(--color-gray-12);
      outline-offset: 2px;
      box-shadow: none;
    }

    &:active:not([data-disabled]),
    &[data-preview-state="active"] {
      opacity: 0.78;
    }

    &[data-disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &[data-preview-state="loading"] {
      opacity: 0.65;
      cursor: progress;
    }

    &[data-preview-state="error"] {
      border-style: dashed;
      border-color: var(--color-accent-11);
    }

    &[data-preview-state="success"] {
      border-color: var(--color-accent-10);
      background-color: var(--color-accent-9);
    }
  }

  .thumb {
    width: var(--space-lg);
    height: var(--space-lg);
    border-radius: var(--border-radius-5);
    background-color: var(--color-gray-12);
    transform: translateX(0);
    transition:
      background-color var(--switch-duration) var(--switch-easing),
      transform var(--switch-duration) var(--switch-easing);

    &[data-checked] {
      background-color: var(--color-accent-1);
      transform: translateX(calc(var(--space-lg) - var(--space-2xs)));
    }
  }

  @media (hover: hover) {
    .root:hover:not([data-disabled]),
    .root[data-preview-state="hover"] {
      background-color: var(--color-gray-6);
    }

    .root[data-checked]:hover:not([data-disabled]) {
      background-color: var(--color-accent-10);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .root,
    .thumb {
      --switch-duration: 0ms;
    }
  }

`

export type SwitchProps = Omit<UISwitch.Root.Props, 'onCheckedChange'> & {
  label: ReactNode
  onChange?: (checked: boolean) => void
}

export default function Switch({
  label,
  className,
  onChange,
  ...props
}: SwitchProps) {
  return (
    <Label className={clsx(styles.label, className)}>
      <UISwitch.Root
        {...props}
        onCheckedChange={onChange}
        className={styles.root}
      >
        <UISwitch.Thumb className={styles.thumb} />
      </UISwitch.Root>
      <span>{label}</span>
    </Label>
  )
}
