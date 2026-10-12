// Run: node --test src/features/rooms/livekit/hooks/reconnectMediaGuard.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attachReconnectMediaGuard,
  type GuardRoom,
} from './reconnectMediaGuard.ts'

type Mic = { isMuted: boolean; paused: boolean } | null

const makeRoom = (init: { share: boolean; mic: Mic }) => {
  const handlers = new Map<string, Set<(...a: unknown[]) => void>>()
  const calls = { setMic: 0 }
  const s = { ...init, micAfterRetry: undefined as Mic | undefined }
  const room = {
    on: (e: string, l: (...a: unknown[]) => void) => {
      if (!handlers.has(e)) handlers.set(e, new Set())
      handlers.get(e)!.add(l)
    },
    off: (e: string, l: (...a: unknown[]) => void) =>
      handlers.get(e)?.delete(l),
    localParticipant: {
      get isScreenShareEnabled() {
        return s.share
      },
      get isMicrophoneEnabled() {
        return !!s.mic && !s.mic.isMuted
      },
      getTrackPublication: () =>
        s.mic
          ? {
              isMuted: s.mic.isMuted,
              track: { isUpstreamPaused: s.mic.paused },
            }
          : undefined,
      setMicrophoneEnabled: async () => {
        calls.setMic++
        if (s.micAfterRetry !== undefined) s.mic = s.micAfterRetry
      },
    },
  } as unknown as GuardRoom
  const emit = (e: string) => handlers.get(e)?.forEach((l) => l())
  return { room, s, calls, emit }
}

const setup = (init: { share: boolean; mic: Mic }) => {
  const r = makeRoom(init)
  const toasts = { share: 0, mic: 0 }
  attachReconnectMediaGuard(r.room, {
    notifyScreenShareLost: () => toasts.share++,
    notifyMicrophoneLost: () => toasts.mic++,
    sleep: async () => {},
  })
  // Let the async handler run to completion.
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  return { ...r, toasts, settle }
}

const GOOD: Mic = { isMuted: false, paused: false }

test('1. share dropped by reconnect: toast, nothing republished', async () => {
  const t = setup({ share: true, mic: GOOD })
  t.emit('signalReconnecting')
  t.s.share = false
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.toasts.share, 1)
  assert.equal(t.toasts.mic, 0)
  assert.equal(t.calls.setMic, 0)
})

test('1b. full restart path: reconnecting then reconnected', async () => {
  const t = setup({ share: true, mic: GOOD })
  t.emit('signalReconnecting')
  t.emit('reconnecting')
  t.s.share = false
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.toasts.share, 1)
})

test('2a. mic unpublished: one retry, toast only if it stays broken', async () => {
  const t = setup({ share: false, mic: GOOD })
  t.emit('reconnecting')
  t.s.mic = null
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.calls.setMic, 1)
  assert.equal(t.toasts.mic, 1)
})

test('2b. mic comes back after the retry: no toast', async () => {
  const t = setup({ share: false, mic: GOOD })
  t.emit('reconnecting')
  t.s.mic = { isMuted: true, paused: false }
  t.s.micAfterRetry = GOOD
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.calls.setMic, 1)
  assert.equal(t.toasts.mic, 0)
})

test('2c. upstream paused counts as broken', async () => {
  const t = setup({ share: false, mic: GOOD })
  t.emit('reconnecting')
  t.s.mic = { isMuted: false, paused: true }
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.calls.setMic, 1)
  assert.equal(t.toasts.mic, 1)
})

test('3. mic muted before the drop: no call, no toast', async () => {
  const t = setup({ share: false, mic: { isMuted: true, paused: false } })
  t.emit('reconnecting')
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.calls.setMic, 0)
  assert.equal(t.toasts.mic + t.toasts.share, 0)
})

test('4. normal reconnect where everything returns: no toast', async () => {
  const t = setup({ share: true, mic: GOOD })
  t.emit('reconnecting')
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.calls.setMic, 0)
  assert.equal(t.toasts.mic + t.toasts.share, 0)
})

test('reconnected without a prior drop is ignored', async () => {
  const t = setup({ share: false, mic: null })
  t.emit('reconnected')
  await t.settle()
  assert.equal(t.toasts.mic + t.toasts.share + t.calls.setMic, 0)
})
