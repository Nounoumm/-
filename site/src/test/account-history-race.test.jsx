import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AccountHistory from '../components/AccountHistory.jsx'
import { cloudFor } from '../lib/account-api.js'
vi.mock('../lib/account-api.js', async (original) => ({ ...await original(), cloudFor: vi.fn() }))
vi.mock('../lib/recovery-db.js', () => ({ listRecovery: vi.fn().mockResolvedValue([]), removeRecovery: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('does not replace the trash listing with a late cloud-list response', async () => {
  let finishCloud, finishTrash
  const list = vi.fn((trash) => new Promise((resolve) => { if (trash) finishTrash = resolve; else finishCloud = resolve }))
  cloudFor.mockReturnValue({ list })
  render(<AccountHistory user={{ id: 'alice', email: 'alice@example.com' }} onOpen={() => {}} onNew={() => {}} />)
  await waitFor(() => expect(list).toHaveBeenCalledWith(false))
  fireEvent.click(screen.getByRole('tab', { name: '回收站' })); await waitFor(() => expect(list).toHaveBeenCalledWith(true))
  await act(async () => finishTrash({ items: [{ id: 'trash', title: '回收站讲义', version: 2, updatedAt: new Date().toISOString() }] }))
  expect(screen.getByRole('heading', { name: '回收站讲义' })).toBeInTheDocument()
  await act(async () => finishCloud({ items: [{ id: 'cloud', title: '账号正常讲义', version: 1, updatedAt: new Date().toISOString() }] }))
  expect(screen.queryByRole('heading', { name: '账号正常讲义' })).toBeNull(); expect(screen.getByRole('heading', { name: '回收站讲义' })).toBeInTheDocument()
})
