import { OTPFieldPreview as OTPField } from '@base-ui/react'
import Flex from '../flex/Flex.jsx'
import Textbox from '../input/Textbox.jsx'
import styles from './Pin.module.css'

export type PinProps = {
  id: string
  value?: string | undefined
  className?: string | undefined
  onChange?: (value: string) => void
}

export default function Pin({ id, value, className, onChange }: PinProps) {
  return (
    <OTPField.Root
      id={id}
      length={4}
      value={value ?? ''}
      {...(onChange && { onValueChange: onChange })}
      {...(className && { className })}
    >
      <Flex gap="3">
        {Array.from({ length: 4 }, (_, index) => (
          <OTPField.Input
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            key={index}
            className={styles.slot}
            render={(props) => <Textbox {...props} />}
          />
        ))}
      </Flex>
    </OTPField.Root>
  )
}
