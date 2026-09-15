import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceSync } from './workspace-sync.js'

function response() {
  const raw = Object.assign(new EventEmitter(), {
    destroyed: false, writableEnded: false,
    write: vi.fn(() => true),
    end: vi.fn(() => { raw.writableEnded = true; raw.emit('close') }),
    destroy: vi.fn(() => { raw.destroyed = true; raw.emit('close') })
  })
  return raw as typeof raw & ServerResponse
}
afterEach(() => vi.useRealTimers())

it('shares polling, revalidates before change delivery, and cleans timers/listeners', async () => {
  vi.useFakeTimers()
  const source = { revision: vi.fn(async () => 'new'), validSessions: vi.fn(async () => new Set(['valid'])) }
  const sync = new WorkspaceSync(source)
  const active = response(), revoked = response()
  sync.connect(active, 'valid', 'old')
  sync.connect(revoked, 'revoked', 'old')
  await vi.advanceTimersByTimeAsync(1000)
  expect(source.revision).toHaveBeenCalledTimes(1)
  expect(source.validSessions).toHaveBeenCalledWith(['valid', 'revoked'])
  expect(active.write).toHaveBeenLastCalledWith('event: change\ndata: {"revision":"new"}\n\n')
  expect(revoked.write).toHaveBeenLastCalledWith('event: session-expired\ndata: {}\n\n')
  expect(revoked.end).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1000)
  expect(active.write).toHaveBeenCalledTimes(2)
  sync.close()
  expect(vi.getTimerCount()).toBe(0)
  expect(active.listenerCount('close')).toBe(0)
})

it('disconnects backpressured consumers without retaining buffers or timers', () => {
  vi.useFakeTimers()
  const sync = new WorkspaceSync({ revision: async () => 'a', validSessions: async () => new Set() })
  const slow = response()
  slow.write.mockReturnValue(false)
  sync.connect(slow, 'valid', 'a')
  expect(slow.destroy).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  expect(slow.listenerCount('error')).toBe(0)
  sync.close()
})

it('prevents overlapping polls and does not write after shutdown during a read', async () => {
  let finish!: (revision: string) => void
  const read = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
  const sync = new WorkspaceSync({ revision: read, validSessions: async () => new Set(['valid']) })
  const raw = response()
  sync.connect(raw, 'valid', 'a')
  const pending = sync.poll()
  await sync.poll()
  expect(read).toHaveBeenCalledOnce()
  sync.close()
  finish('b')
  await pending
  expect(raw.write).toHaveBeenCalledTimes(1)
})

it('closes streams on database failure and sends heartbeat for idle streams', async () => {
  vi.useFakeTimers()
  const read = vi.fn(async () => 'a')
  const sync = new WorkspaceSync({ revision: read, validSessions: async () => new Set(['valid']) })
  const raw = response()
  sync.connect(raw, 'valid', 'a')
  await vi.advanceTimersByTimeAsync(15000)
  expect(raw.write).toHaveBeenLastCalledWith(': heartbeat\n\n')
  read.mockRejectedValueOnce(new Error('offline'))
  await sync.poll()
  expect(raw.end).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
