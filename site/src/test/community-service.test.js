import { afterEach, describe, expect, it } from 'vitest'
import { createCommunityDb } from '../../server/db/index.js'
import { getPublicHandout, publishHandout, reportHandout, searchHandouts, updateHandout, withdrawHandout } from '../../server/services/community.js'

const spec = (title = '示例讲义') => ({ schema: 'course-handout/1', meta: { title }, modules: [] })
let current
afterEach(() => current?.close())

describe('community service', () => {
  it('publishes and searches without exposing the management token', () => {
    current = createCommunityDb(':memory:')
    const created = publishHandout(current.db, { spec: spec(), displayName: '学习者', tags: ['C'] })
    const item = getPublicHandout(current.db, created.id)
    expect(created.manageToken).toHaveLength(43)
    expect(item).toMatchObject({ id: created.id, displayName: '学习者', tags: ['C'] })
    expect(item).not.toHaveProperty('manageToken')
    expect(searchHandouts(current.db, { query: '示例' }).items).toHaveLength(1)
  })

  it('requires the one-time management token for updates and withdrawal', () => {
    current = createCommunityDb(':memory:')
    const created = publishHandout(current.db, { spec: spec() })
    expect(() => updateHandout(current.db, created.id, 'wrong', { spec: spec('改') })).toThrow('无法管理')
    updateHandout(current.db, created.id, created.manageToken, { spec: spec('改') })
    expect(getPublicHandout(current.db, created.id).title).toBe('改')
    withdrawHandout(current.db, created.id, created.manageToken)
    expect(getPublicHandout(current.db, created.id)).toBeNull()
  })

  it('accepts a bounded report reason for a visible handout', () => {
    current = createCommunityDb(':memory:')
    const created = publishHandout(current.db, { spec: spec() })
    expect(reportHandout(current.db, created.id, { reason: 'other', details: '请核查' })).toBeTruthy()
    expect(() => reportHandout(current.db, created.id, { reason: 'bad' })).toThrow('举报理由无效')
  })
})
