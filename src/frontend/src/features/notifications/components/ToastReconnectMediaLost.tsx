import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { VStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { StyledToastContainer } from './StyledToastContainer'

type Kind = 'screenShareLostOnReconnect' | 'microphoneLostOnReconnect'

export function ToastReconnectMediaLost({
  state,
  kind,
  ...props
}: Readonly<ToastProps & { kind: Kind }>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <VStack
        justify="start"
        alignItems="self-start"
        {...contentProps}
        maxWidth="370px"
        padding={14}
      >
        <p>{t(kind)}</p>
      </VStack>
    </StyledToastContainer>
  )
}
