import { OTPInput, type SlotProps } from 'input-otp'
import Flex from '../flex/Flex.jsx'
import styles from './Pin.module.css'

export type PinProps = {
  value?: string | undefined
  className?: string | undefined
  onChange?: (value: string) => void
}

export default function Pin({ value, className, onChange }: PinProps) {
  return (
    <OTPInput
      maxLength={4}
      value={value ?? ''}
      {...(onChange && { onChange })}
      {...(className && { containerClassName: className })}
      render={({ slots }) => (
        <Flex gap="2" justify="center">
          {slots.map((slot, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            <Slot key={i} {...slot} placeholderChar="•" />
          ))}
        </Flex>
      )}
    />
  )
}

function Slot(props: SlotProps) {
  return (
    <div className={styles.slot}>{props.char ?? props.placeholderChar}</div>
  )
}
