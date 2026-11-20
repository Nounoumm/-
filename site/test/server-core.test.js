import { test } from 'vitest'
import assert from 'node:assert/strict'
import { validateGenerateInput } from '../server/lib/validation.js'
import { createLocalOutline } from '../server/services/generation.js'
import { extractTextFiles } from '../server/services/materials.js'

test('server validation accepts an outline request without selected modules', () => {
  const result = validateGenerateInput({ topic: '线性代数', audience: '学生', chapters: 4, template: 'standard', depth: 'standard', exercises: 'basic' }, { requireSelection: false })
  assert.equal(result.ok, true)
})

test('local outline creates stable selectable module ids', () => {
  const outline = createLocalOutline({ topic: '线性代数', audience: '学生', chapters: 4, template: 'standard' })
  assert.equal(outline.schema, 'course-handout/outline/1')
  assert.deepEqual(outline.modules.map((item) => item.id), ['module-1', 'module-2'])
  assert.equal(outline.modules.flatMap((item) => item.chapters).length, 4)
})

test('materials extraction accepts text and rejects unsupported formats', async () => {
  const result = await extractTextFiles([{ name: 'notes.md', text: '# 主题\n\n正文' }])
  assert.equal(result[0].chars, 8)
  await assert.rejects(() => extractTextFiles([{ name: 'program.exe', text: 'bad' }]), /不支持的资料格式/)
})
