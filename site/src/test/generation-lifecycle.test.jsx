import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CreateHandout from '../components/CreateHandout.jsx'
import { api } from '../lib/api.js'
vi.mock('../lib/api.js', () => ({ api: { outline: vi.fn(), generate: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('aborts generation on unmount and ignores a late old-account result', async () => {
  let finish, signal
  api.outline.mockResolvedValue({ outline: { modules: [{ id: 'm', title: '模块', chapters: [{ id: 'c', title: '章节', sections: [] }] }] } })
  api.generate.mockImplementation((_input, requestSignal) => { signal = requestSignal; return new Promise((resolve) => { finish = resolve }) })
  const onGenerated = vi.fn(); const { unmount } = render(<CreateHandout templates={[{ id: 'standard', name: '标准' }]} onGenerated={onGenerated} />)
  fireEvent.change(screen.getByLabelText('主题'), { target: { value: '测试主题' } }); fireEvent.click(screen.getByRole('button', { name: /生成模块大纲/ }))
  fireEvent.click(await screen.findByRole('button', { name: '生成 1 个模块' })); await waitFor(() => expect(api.generate).toHaveBeenCalled())
  unmount(); expect(signal.aborted).toBe(true); finish({ meta: { title: '旧账号' } }); await Promise.resolve(); expect(onGenerated).not.toHaveBeenCalled()
})
