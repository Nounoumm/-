import { describe, expect, it, vi } from 'vitest'
import { createHistoryController } from '../lib/history-controller.js'

describe('serial draft saving', () => {
  it('serializes requests and combines edits waiting behind a slow request', async () => {
    let finish
    const values = []
    const save = vi.fn(async (value) => { values.push(value); if (value === 'a') await new Promise((resolve) => { finish = resolve }) })
    const controller = createHistoryController({ save, delayMs: 100000 })
    controller.schedule('a'); const flushing = controller.flush()
    controller.schedule('b'); controller.schedule('c')
    expect(values).toEqual(['a'])
    finish(); await flushing
    expect(values).toEqual(['a', 'c'])
    expect(controller.hasPending()).toBe(false)
  })
  it('retains failed content for an explicit retry and reports the failure', async () => {
    const error = new Error('offline'); const onError = vi.fn()
    const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined)
    const controller = createHistoryController({ save, onError, delayMs: 100000 })
    controller.schedule('draft')
    await expect(controller.flush()).rejects.toThrow('offline')
    expect(controller.hasPending()).toBe(true); expect(onError).toHaveBeenCalledWith(error)
    await controller.flush()
    expect(save).toHaveBeenLastCalledWith('draft', expect.any(AbortSignal))
    expect(controller.hasPending()).toBe(false)
  })
  it('cancels queued account writes without submitting them to the next account', async () => {
    const save = vi.fn(); const controller = createHistoryController({ save, delayMs: 100000 })
    controller.schedule({ account: 'alice' }); controller.cancel(); await controller.flush()
    expect(save).not.toHaveBeenCalled(); expect(controller.hasPending()).toBe(false)
  })
})
