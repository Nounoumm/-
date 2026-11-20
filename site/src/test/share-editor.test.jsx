import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ShareEditor from '../components/ShareEditor.jsx'
afterEach(cleanup)
it('edits readable public title and section fields while preserving the rest of the snapshot', () => {
  const spec = { schema: 'course-handout/1', meta: { title: '原讲义', audience: '学生' }, modules: [{ title: '原模块', description: '保留模块说明', chapters: [{ title: '原章节', objectives: ['目标'], sections: [{ title: '原小节', body: '原正文' }], summary: ['小结'], exercises: { basic: ['题目'] }, answers: ['答案'] }] }] }
  const onSave = vi.fn(); render(<ShareEditor item={{ spec, displayName: '作者', tags: ['课程'] }} onSave={onSave} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('讲义标题'), { target: { value: '新讲义' } }); fireEvent.change(screen.getByLabelText('第 1.1 节正文'), { target: { value: '新正文' } }); fireEvent.click(screen.getByRole('button', { name: '确认更新公开内容' }))
  const payload = onSave.mock.calls[0][0]; expect(payload.spec.meta.title).toBe('新讲义'); expect(payload.spec.modules[0].chapters[0].sections[0].body).toBe('新正文'); expect(payload.spec.modules[0].chapters[0].answers).toEqual(['答案']); expect(payload.spec.modules[0].description).toBe('保留模块说明'); expect(spec.meta.title).toBe('原讲义'); expect(screen.queryByLabelText(/JSON/)).toBeNull()
})
