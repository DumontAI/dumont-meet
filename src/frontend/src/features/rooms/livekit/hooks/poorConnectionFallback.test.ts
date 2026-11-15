// Run: node --test src/features/rooms/livekit/hooks/poorConnectionFallback.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attachPoorConnectionFallback,
  isRecoveredQuality,
  shouldRestoreCamera,
  type FallbackRoom,
} from './poorConnectionFallback.ts'

type Listener = (...args: unknown[]) => void

const makeRoom = (cameraEnabled = true) => {
  const listeners = new Map<string, Set<Listener>>()
  const calls: boolean[] = []
  const localParticipant = {
    isCameraEnabled: cameraEnabled,
    connectionQuality: 'poor',
    setCameraEnabled: async (enabled: boolean) => {
      calls.push(enabled)
      localParticipant.isCameraEnabled = enabled
    },
    on: (event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(listener)
    },
    off: (event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener)
    },
  }
  return {
    localParticipant,
    calls,
    emit: (event: string, ...args: unknown[]) =>
      listeners.get(event)?.forEach((listener) => listener(...args)),
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

const setup = () => {
  const room = makeRoom()
  let notifications = 0
  let grace: (() => void) | null = null

  const cleanup = attachPoorConnectionFallback(
    room as unknown as FallbackRoom,
    {
      notifyDegraded: () => {
        notifications++
      },
      schedule: (fn) => {
        grace = fn
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
      cancel: () => {
        grace = null
      },
    }
  )

  return {
    room,
    notifications: () => notifications,
    cleanup,
    runGrace: () => {
      const fn = grace
      grace = null
      fn?.()
    },
  }
}

test('isRecoveredQuality', () => {
  assert.equal(isRecoveredQuality('excellent'), true)
  assert.equal(isRecoveredQuality('good'), true)
  assert.equal(isRecoveredQuality('poor'), false)
  assert.equal(isRecoveredQuality('unknown'), false)
  assert.equal(isRecoveredQuality('lost'), false)
})

test('shouldRestoreCamera only restores a camera the fallback turned off', () => {
  assert.equal(shouldRestoreCamera('good', true, false), true)
  assert.equal(shouldRestoreCamera('excellent', true, false), true)
  assert.equal(shouldRestoreCamera('poor', true, false), false)
  assert.equal(shouldRestoreCamera('unknown', true, false), false)
  assert.equal(shouldRestoreCamera('good', false, false), false)
  assert.equal(shouldRestoreCamera('good', true, true), false)
})

test('turns the camera off after the grace period and back on when the connection recovers', async () => {
  const { room, notifications, runGrace } = setup()

  room.emit('connectionQualityChanged', 'poor')
  assert.deepEqual(room.calls, [])

  runGrace()
  await flush()
  assert.deepEqual(room.calls, [false])
  assert.equal(room.localParticipant.isCameraEnabled, false)
  assert.equal(notifications(), 1)

  room.localParticipant.connectionQuality = 'good'
  room.emit('connectionQualityChanged', 'good')
  await flush()

  assert.deepEqual(room.calls, [false, true])
  assert.equal(room.localParticipant.isCameraEnabled, true)
})

test('does not restore while the connection is still poor or unknown', async () => {
  const { room, runGrace } = setup()

  room.emit('connectionQualityChanged', 'poor')
  runGrace()
  await flush()

  room.emit('connectionQualityChanged', 'unknown')
  await flush()
  assert.deepEqual(room.calls, [false])

  room.localParticipant.connectionQuality = 'good'
  room.emit('connectionQualityChanged', 'good')
  await flush()
  assert.deepEqual(room.calls, [false, true])
})

test('does not restore a camera the user turned on then off again', async () => {
  const { room, runGrace } = setup()

  room.emit('connectionQualityChanged', 'poor')
  runGrace()
  await flush()

  room.localParticipant.isCameraEnabled = true
  room.emit('localTrackPublished', { source: 'camera' })
  room.localParticipant.isCameraEnabled = false

  room.localParticipant.connectionQuality = 'good'
  room.emit('connectionQualityChanged', 'good')
  await flush()

  assert.deepEqual(room.calls, [false])
})

test('leaves a camera that was already off alone', async () => {
  const { room, notifications, runGrace } = setup()
  room.localParticipant.isCameraEnabled = false

  room.emit('connectionQualityChanged', 'poor')
  runGrace()
  await flush()

  assert.deepEqual(room.calls, [])
  assert.equal(notifications(), 0)
})

test('does not turn the camera off if the connection recovered before the grace expired', async () => {
  const { room, notifications, runGrace } = setup()

  room.emit('connectionQualityChanged', 'poor')
  room.localParticipant.connectionQuality = 'good'
  runGrace()
  await flush()

  assert.deepEqual(room.calls, [])
  assert.equal(notifications(), 0)
})

test('cleanup unsubscribes and cancels the pending grace timer', async () => {
  const { room, cleanup, runGrace } = setup()

  room.emit('connectionQualityChanged', 'poor')
  cleanup()
  runGrace()
  await flush()

  assert.deepEqual(room.calls, [])
  assert.equal(room.listenerCount('connectionQualityChanged'), 0)
  assert.equal(room.listenerCount('localTrackPublished'), 0)
})
