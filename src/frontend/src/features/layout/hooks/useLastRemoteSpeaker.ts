import { RoomEvent } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { useEffect, useState } from 'react'

/**
 * Identity of the remote participant who spoke most recently. Keeps the last
 * value while nobody talks, so speaker view does not flicker back to a default.
 * Only listens when `enabled`, so the stage does not re-render on speaker
 * events in the other layouts.
 */
export function useLastRemoteSpeaker(enabled: boolean) {
  const room = useRoomContext()
  const [identity, setIdentity] = useState<string>()

  useEffect(() => {
    if (!enabled) return
    const onActiveSpeakersChanged = (speakers: Participant[]) => {
      const speaker = speakers.find((p) => !p.isLocal)
      if (speaker) setIdentity(speaker.identity)
    }
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    }
  }, [room, enabled])

  return identity
}
