import { FocusLayoutContainer, useTracks } from '@livekit/components-react'
import { CarouselLayout } from '@/features/layout/components/CarouselLayout'
import { FocusLayout } from '@/features/layout/components/FocusLayout'
import { ParticipantTile } from '@/features/participantTile/components/ParticipantTile'
import { GridLayout } from '@/features/layout/components/GridLayout'
import {
  isEqualTrackRef,
  isTrackReference,
  log,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { RoomEvent, Track } from 'livekit-client'
import { useSnapshot } from 'valtio'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'
import { useEffect, useRef } from 'react'
import { viewPreferencesStore } from '@/stores/viewPreferences'
import { useLastRemoteSpeaker } from '@/features/layout/hooks/useLastRemoteSpeaker'

export const StageLayout = () => {
  const lastAutoFocusedScreenShareTrack =
    useRef<TrackReferenceOrPlaceholder | null>(null)

  const { layoutMode, hideSelfView, hideNonVideo } =
    useSnapshot(viewPreferencesStore)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    {
      // Hiding non-video tiles needs to see camera mute changes.
      updateOnlyOn: hideNonVideo
        ? [RoomEvent.TrackMuted, RoomEvent.TrackUnmuted]
        : [],
      onlySubscribed: false,
    }
  )

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare)

  const { pinnedTrackRef } = useSnapshot(layoutStore)

  const lastSpeaker = useLastRemoteSpeaker(layoutMode === 'speaker')
  const isRemoteCamera = (track: TrackReferenceOrPlaceholder) =>
    track.source === Track.Source.Camera && !track.participant.isLocal
  const speakerTrack =
    layoutMode === 'speaker' && tracks.length > 1
      ? (tracks.find(
          (track) =>
            isRemoteCamera(track) && track.participant.identity === lastSpeaker
        ) ?? tracks.find(isRemoteCamera))
      : undefined

  // A pin (manual, or an auto-focused screen share) wins over the speaker.
  const focusedTrack = pinnedTrackRef ?? speakerTrack

  const isHiddenTile = (track: TrackReferenceOrPlaceholder) =>
    track.source === Track.Source.Camera &&
    ((hideSelfView && track.participant.isLocal) ||
      (hideNonVideo && (!isTrackReference(track) || track.publication.isMuted)))
  const shownTracks = tracks.filter((track) => !isHiddenTile(track))
  // Never leave an empty stage: if the filters hide everything, show all.
  const visibleTracks = shownTracks.length ? shownTracks : tracks

  const carouselTracks = visibleTracks.filter(
    (track) => !isEqualTrackRef(track, focusedTrack)
  )

  /* eslint-disable react-hooks/exhaustive-deps */
  // Code duplicated from LiveKit; this warning will be addressed in the refactoring.
  useEffect(() => {
    // Gallery mode never auto-focuses a screen share; drop one it inherited.
    if (layoutMode === 'gallery') {
      if (lastAutoFocusedScreenShareTrack.current) {
        clearPinnedTrack()
        lastAutoFocusedScreenShareTrack.current = null
      }
    }
    // If screen share tracks are published, and no pin is set explicitly, auto set the screen share.
    else if (
      screenShareTracks.some((track) => track.publication.isSubscribed) &&
      lastAutoFocusedScreenShareTrack.current === null
    ) {
      log.debug('Auto set screen share focus:', {
        newScreenShareTrack: screenShareTracks[0],
      })
      setPinnedTrack(screenShareTracks[0])
      lastAutoFocusedScreenShareTrack.current = screenShareTracks[0]
    } else if (
      lastAutoFocusedScreenShareTrack.current &&
      !screenShareTracks.some(
        (track) =>
          track.publication.trackSid ===
          lastAutoFocusedScreenShareTrack.current?.publication?.trackSid
      )
    ) {
      log.debug('Auto clearing screen share focus.')
      clearPinnedTrack()
      lastAutoFocusedScreenShareTrack.current = null
    }
    if (pinnedTrackRef && !isTrackReference(pinnedTrackRef)) {
      const updatedFocusTrack = tracks.find(
        (tr) =>
          tr.participant.identity === pinnedTrackRef.participant.identity &&
          tr.source === pinnedTrackRef.source
      )
      if (
        updatedFocusTrack !== pinnedTrackRef &&
        isTrackReference(updatedFocusTrack)
      ) {
        setPinnedTrack(updatedFocusTrack)
      }
    }
  }, [
    screenShareTracks
      .map(
        (ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`
      )
      .join(),
    pinnedTrackRef?.publication?.trackSid,
    tracks,
    layoutMode,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <>
      {!focusedTrack ? (
        <div className="lk-grid-layout-wrapper" style={{ height: 'auto' }}>
          <GridLayout tracks={visibleTracks} style={{ padding: 0 }}>
            <ParticipantTile />
          </GridLayout>
        </div>
      ) : (
        <div className="lk-focus-layout-wrapper" style={{ height: 'auto' }}>
          <FocusLayoutContainer style={{ padding: 0 }}>
            <CarouselLayout
              tracks={carouselTracks}
              style={{
                minWidth: '200px',
              }}
            >
              <ParticipantTile />
            </CarouselLayout>
            <FocusLayout trackRef={focusedTrack} />
          </FocusLayoutContainer>
        </div>
      )}
    </>
  )
}
