import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  notifyMicrophoneLostOnReconnect,
  notifyScreenShareLostOnReconnect,
} from '@/features/notifications/utils'
import { reportError } from '@/features/analytics/telemetry'
import {
  attachReconnectMediaGuard,
  type GuardRoom,
} from './reconnectMediaGuard'

/**
 * After a reconnection, tell the user when the screen share did not come back
 * and when the microphone stopped reaching others (retrying it once first).
 * It never republishes the screen share (that needs a user gesture) and never
 * turns on a microphone the user had muted before the drop.
 */
export const useReconnectMediaGuard = () => {
  const room = useRoomContext()

  useEffect(
    () =>
      attachReconnectMediaGuard(room as unknown as GuardRoom, {
        notifyScreenShareLost: notifyScreenShareLostOnReconnect,
        notifyMicrophoneLost: notifyMicrophoneLostOnReconnect,
        onError: (error) =>
          reportError('device_switch_failure', error, {
            at: 'useReconnectMediaGuard',
          }),
      }),
    [room]
  )
}
