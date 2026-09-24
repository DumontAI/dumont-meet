import { useEffect, useRef } from 'react'
import { ConnectionQuality, RoomEvent } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { useSnapshot } from 'valtio'
import { userPreferencesStore } from '@/stores/userPreferences'
import { notifyConnectionDegraded } from '@/features/notifications/utils'
import { captureEvent, reportError } from '@/features/analytics/telemetry'

/**
 * Poor-connection fallback: when the local participant's connection stays poor
 * for the grace period, turn the camera off and tell the user, so the audio
 * (which needs a fraction of the uplink) keeps working instead of the whole
 * call degrading.
 *
 * One-way on purpose: the camera is never turned back on automatically, so a
 * flapping connection cannot make the video blink. The toast offers the one
 * click back, and the preference can disable the behaviour entirely.
 */
const POOR_QUALITY_GRACE_MS = 15_000

export const usePoorConnectionFallback = () => {
  const room = useRoomContext()
  const { is_auto_degrade_on_poor_connection_enabled } =
    useSnapshot(userPreferencesStore)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handledEpisodeRef = useRef(false)

  useEffect(() => {
    if (!is_auto_degrade_on_poor_connection_enabled) return

    const clearGraceTimer = () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current)
        graceTimerRef.current = null
      }
    }

    const handleQualityChanged = (quality: ConnectionQuality) => {
      if (quality !== ConnectionQuality.Poor) {
        clearGraceTimer()
        handledEpisodeRef.current = false
        return
      }

      if (graceTimerRef.current || handledEpisodeRef.current) return

      graceTimerRef.current = setTimeout(() => {
        graceTimerRef.current = null
        handledEpisodeRef.current = true

        if (!room.localParticipant.isCameraEnabled) return

        room.localParticipant
          .setCameraEnabled(false)
          .then(() => {
            notifyConnectionDegraded()
            captureEvent('connection_fallback_audio_only')
          })
          .catch((error) => {
            reportError('device_switch_failure', error, {
              at: 'usePoorConnectionFallback',
            })
          })
      }, POOR_QUALITY_GRACE_MS)
    }

    room.localParticipant.on(
      RoomEvent.ConnectionQualityChanged,
      handleQualityChanged
    )
    return () => {
      clearGraceTimer()
      room.localParticipant.off(
        RoomEvent.ConnectionQualityChanged,
        handleQualityChanged
      )
    }
  }, [room, is_auto_degrade_on_poor_connection_enabled])
}
