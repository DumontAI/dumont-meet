import type { RoomEvent } from 'livekit-client'

/**
 * Framework-free core of useReconnectMediaGuard, kept free of runtime imports
 * so `node --test` can run it against a fake room (see
 * reconnectMediaGuard.test.ts).
 *
 * After a reconnection (resume or full restart) LiveKit republishes tracks
 * asynchronously and only logs failures, so a screen share can vanish and the
 * microphone can stay unpublished or muted without the UI knowing.
 */

export const REPUBLISH_SETTLE_MS = 3_000
export const MIC_RECHECK_MS = 2_000

export type MediaSnapshot = {
  hadScreenShare: boolean
  micWanted: boolean
}

export type MediaState = {
  screenShareEnabled: boolean
  micPublished: boolean
  micMuted: boolean
  micUpstreamPaused: boolean
}

export type ReconnectMediaReport = {
  hadScreenShare: boolean
  screenShareRestored: boolean
  micWanted: boolean
  micPublished: boolean
  micMuted: boolean
  micRetried: boolean
}

export const isMicBroken = (state: MediaState) =>
  !state.micPublished || state.micMuted || state.micUpstreamPaused

// Retrying means setMicrophoneEnabled(true), which also unmutes. So it only
// runs when there is no publication or the upstream is paused and the user has
// not muted: a published-but-muted mic is never touched, only reported.
export const decideReconnectActions = (
  snapshot: MediaSnapshot,
  state: MediaState
) => ({
  notifyScreenShareLost: snapshot.hadScreenShare && !state.screenShareEnabled,
  retryMic:
    snapshot.micWanted &&
    !state.micMuted &&
    (!state.micPublished || state.micUpstreamPaused),
  notifyMicMuted: snapshot.micWanted && state.micPublished && state.micMuted,
})

type Listener = (...args: unknown[]) => void

export type GuardRoom = {
  on: (event: `${RoomEvent}`, listener: Listener) => unknown
  off: (event: `${RoomEvent}`, listener: Listener) => unknown
  localParticipant: {
    isScreenShareEnabled: boolean
    isMicrophoneEnabled: boolean
    getTrackPublication: (source: 'microphone') =>
      | {
          isMuted: boolean
          track?: { isUpstreamPaused: boolean }
        }
      | undefined
    setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>
  }
}

export type GuardDeps = {
  notifyScreenShareLost: () => void
  notifyMicrophoneLost: () => void
  onError?: (error: unknown) => void
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export const readMediaState = (room: GuardRoom): MediaState => {
  const lp = room.localParticipant
  const pub = lp.getTrackPublication('microphone')
  return {
    screenShareEnabled: lp.isScreenShareEnabled,
    micPublished: !!pub,
    micMuted: !!pub?.isMuted,
    micUpstreamPaused: !!pub?.track?.isUpstreamPaused,
  }
}

const reportListeners = new Set<(report: ReconnectMediaReport) => void>()

export const onReconnectMediaReport = (
  listener: (report: ReconnectMediaReport) => void
) => {
  reportListeners.add(listener)
  return () => {
    reportListeners.delete(listener)
  }
}

type SourcedPublication = { source?: string } | undefined

export const attachReconnectMediaGuard = (room: GuardRoom, deps: GuardDeps) => {
  const sleep = deps.sleep ?? defaultSleep
  // Kept until a check completes, so a second drop during the settle wait
  // reuses the first snapshot instead of one taken from degraded state.
  let snapshot: MediaSnapshot | null = null
  // Bumped whenever a new drop or a disconnect makes an in-flight check stale.
  let generation = 0
  // Set between Reconnected and the end of the check. The SDK finishes its
  // republish before emitting Reconnected, so an unpublish seen here is the
  // user's own (stop sharing), not the reconnect's unpublish/republish cycle.
  let settling = false
  // The SDK never mutes the mic itself, so a mute after the snapshot is the
  // user's choice (or a moderator's) and must not raise a "lost" toast.
  let userMutedMic = false
  let userStoppedShare = false

  const handleReconnecting = () => {
    generation++
    settling = false
    // A resume that escalates to a full restart emits both events: keep the
    // first snapshot, taken while the tracks were still the user's own.
    if (snapshot) return
    snapshot = {
      hadScreenShare: room.localParticipant.isScreenShareEnabled,
      micWanted: room.localParticipant.isMicrophoneEnabled,
    }
    userMutedMic = false
    userStoppedShare = false
  }

  const handleDisconnected = () => {
    generation++
    settling = false
    snapshot = null
  }

  const handleTrackMuted = (pub: unknown, participant: unknown) => {
    if (!snapshot || participant !== room.localParticipant) return
    if ((pub as SourcedPublication)?.source === 'microphone') {
      userMutedMic = true
    }
  }

  const handleLocalTrackUnpublished = (pub: unknown) => {
    if (!snapshot || !settling) return
    if ((pub as SourcedPublication)?.source === 'screen_share') {
      userStoppedShare = true
    }
  }

  const handleReconnected = async () => {
    const taken = snapshot
    if (!taken) return
    const mine = ++generation
    settling = true

    await sleep(REPUBLISH_SETTLE_MS)
    if (mine !== generation) return
    snapshot = null

    let state = readMediaState(room)
    const actions = decideReconnectActions(taken, state)
    const initial = state

    if (actions.notifyScreenShareLost && !userStoppedShare) {
      deps.notifyScreenShareLost()
    }

    let micRetried = false
    if (actions.notifyMicMuted && !userMutedMic) deps.notifyMicrophoneLost()
    if (actions.retryMic && !userMutedMic) {
      micRetried = true
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch (error) {
        deps.onError?.(error)
      }
      await sleep(MIC_RECHECK_MS)
      if (mine !== generation) return
      state = readMediaState(room)
      if (isMicBroken(state) && !userMutedMic) deps.notifyMicrophoneLost()
    }
    settling = false

    const report: ReconnectMediaReport = {
      hadScreenShare: taken.hadScreenShare,
      screenShareRestored: taken.hadScreenShare && state.screenShareEnabled,
      micWanted: taken.micWanted,
      micPublished: initial.micPublished,
      micMuted: initial.micMuted,
      micRetried,
    }
    reportListeners.forEach((listener) => listener(report))
  }

  const listeners: [`${RoomEvent}`, Listener][] = [
    ['reconnecting', handleReconnecting],
    ['signalReconnecting', handleReconnecting],
    ['reconnected', handleReconnected],
    ['disconnected', handleDisconnected],
    ['trackMuted', handleTrackMuted],
    ['localTrackUnpublished', handleLocalTrackUnpublished],
  ]
  listeners.forEach(([event, listener]) => room.on(event, listener))

  return () => {
    generation++
    listeners.forEach(([event, listener]) => room.off(event, listener))
  }
}
