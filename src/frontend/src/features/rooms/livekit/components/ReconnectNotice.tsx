import { ConnectionState } from 'livekit-client'
import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { Loader } from '@/primitives/Loader'
import { css } from '@/styled-system/css'

/**
 * A reconnection that takes a couple of seconds looks like a frozen call unless
 * the app says otherwise. This is the "say otherwise": a small notice while
 * LiveKit is reconnecting, gone the moment the room is connected again.
 */
export const ReconnectNotice = () => {
  const room = useRoomContext()
  const connectionState = useConnectionState(room)
  const { t } = useTranslation('rooms')

  if (
    connectionState !== ConnectionState.Reconnecting &&
    connectionState !== ConnectionState.SignalReconnecting
  ) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={css({
        position: 'fixed',
        top: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        backgroundColor: 'primaryDark.800',
        color: 'white',
        padding: '0.5rem 0.875rem',
        borderRadius: 'full',
        fontSize: 'sm',
        boxShadow: 'md',
      })}
    >
      <Loader />
      {t('reconnecting')}
    </div>
  )
}
