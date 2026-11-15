export const POOR_QUALITY_GRACE_MS = 15_000

export const isRecoveredQuality = (quality: string) =>
  quality === 'good' || quality === 'excellent'

export const shouldRestoreCamera = (
  quality: string,
  autoDegraded: boolean,
  cameraEnabled: boolean
) => autoDegraded && !cameraEnabled && isRecoveredQuality(quality)

type Listener = (...args: unknown[]) => void
type TimerHandle = ReturnType<typeof setTimeout>

export type FallbackRoom = {
  localParticipant: {
    isCameraEnabled: boolean
    connectionQuality: string
    setCameraEnabled: (enabled: boolean) => Promise<unknown>
    on: (event: string, listener: Listener) => unknown
    off: (event: string, listener: Listener) => unknown
  }
}

export type FallbackDeps = {
  notifyDegraded: () => void
  onAutoDegrade?: () => void
  onError?: (error: unknown) => void
  schedule?: (fn: () => void, ms: number) => TimerHandle
  cancel?: (handle: TimerHandle) => void
}

const defaultSchedule = (fn: () => void, ms: number) => setTimeout(fn, ms)
const defaultCancel = (handle: TimerHandle) => clearTimeout(handle)

/**
 * Framework-free core of usePoorConnectionFallback, kept free of runtime
 * imports so `node --test` can drive it with a fake room.
 *
 * The camera is restored when the connection recovers, but only when this
 * fallback turned it off. A camera the user turned on (or off) stays theirs.
 */
export const attachPoorConnectionFallback = (
  room: FallbackRoom,
  deps: FallbackDeps
) => {
  const schedule = deps.schedule ?? defaultSchedule
  const cancel = deps.cancel ?? defaultCancel
  let graceTimer: TimerHandle | null = null
  let handledEpisode = false
  let autoDegraded = false

  const clearGraceTimer = () => {
    if (graceTimer !== null) {
      cancel(graceTimer)
      graceTimer = null
    }
  }

  const restoreCamera = () => {
    autoDegraded = false
    if (room.localParticipant.isCameraEnabled) return
    room.localParticipant
      .setCameraEnabled(true)
      .catch((error) => deps.onError?.(error))
  }

  const handleCameraEnabled = (publication: unknown) => {
    if ((publication as { source?: string })?.source === 'camera') {
      autoDegraded = false
    }
  }

  const handleQualityChanged = (quality: unknown) => {
    const nextQuality = quality as string
    if (nextQuality !== 'poor') {
      clearGraceTimer()
      handledEpisode = false
      if (
        shouldRestoreCamera(
          nextQuality,
          autoDegraded,
          room.localParticipant.isCameraEnabled
        )
      ) {
        restoreCamera()
      }
      return
    }

    if (graceTimer !== null || handledEpisode) return

    graceTimer = schedule(() => {
      graceTimer = null
      handledEpisode = true

      if (
        !room.localParticipant.isCameraEnabled ||
        isRecoveredQuality(room.localParticipant.connectionQuality)
      ) {
        return
      }

      room.localParticipant
        .setCameraEnabled(false)
        .then(() => {
          autoDegraded = true
          deps.notifyDegraded()
          deps.onAutoDegrade?.()
          if (
            shouldRestoreCamera(
              room.localParticipant.connectionQuality,
              autoDegraded,
              room.localParticipant.isCameraEnabled
            )
          ) {
            restoreCamera()
          }
        })
        .catch((error) => {
          autoDegraded = false
          deps.onError?.(error)
        })
    }, POOR_QUALITY_GRACE_MS)
  }

  room.localParticipant.on('connectionQualityChanged', handleQualityChanged)
  room.localParticipant.on('localTrackPublished', handleCameraEnabled)

  return () => {
    autoDegraded = false
    clearGraceTimer()
    room.localParticipant.off('connectionQualityChanged', handleQualityChanged)
    room.localParticipant.off('localTrackPublished', handleCameraEnabled)
  }
}
