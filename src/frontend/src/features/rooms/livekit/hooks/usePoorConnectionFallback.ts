import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { useSnapshot } from 'valtio'
import { userPreferencesStore } from '@/stores/userPreferences'
import { notifyConnectionDegraded } from '@/features/notifications/utils'
import { captureEvent, reportError } from '@/features/analytics/telemetry'
import {
  attachPoorConnectionFallback,
  type FallbackRoom,
} from './poorConnectionFallback'

/**
 * Poor-connection fallback: when the local participant's connection stays poor
 * for the grace period, turn the camera off and tell the user, so the audio
 * (which needs a fraction of the uplink) keeps working instead of the whole
 * call degrading.
 *
 * The camera is restored automatically when the connection recovers, but only
 * when this fallback turned it off: a camera the user turned off stays off.
 * The toast offers the one click back, and the preference can disable the
 * behaviour entirely.
 */
export const usePoorConnectionFallback = () => {
  const room = useRoomContext()
  const { is_auto_degrade_on_poor_connection_enabled } =
    useSnapshot(userPreferencesStore)

  useEffect(() => {
    if (!is_auto_degrade_on_poor_connection_enabled) return

    return attachPoorConnectionFallback(room as unknown as FallbackRoom, {
      notifyDegraded: notifyConnectionDegraded,
      onAutoDegrade: () => captureEvent('connection_fallback_audio_only'),
      onError: (error) =>
        reportError('device_switch_failure', error, {
          at: 'usePoorConnectionFallback',
        }),
    })
  }, [room, is_auto_degrade_on_poor_connection_enabled])
}
