import { describe, expect, it } from 'vitest'
import { validateGenerateInput, isHandoutSpec } from '../lib/handout-schema.js'

describe('讲义输入校验', () => {
  it('accepts a valid learner request', () => {
    const result = validateGenerateInput({ topic: 'C 语言指针', audience: '大一学生', chapters: 6, template: 'standard', depth: 'standard', exercises: 'basic', selectedModuleIds: ['module-1'] }, ['standard', 'review', 'project', 'bilingual'])
    expect(result.ok).toBe(true)
    expect(result.value.chapters).toBe(6)
  })

  it('rejects invalid choices and an empty module selection', () => {
    const result = validateGenerateInput({ topic: 'x', chapters: 20, template: 'other', depth: 'long', exercises: 'many' }, ['standard'])
    expect(result.ok).toBe(false)
    expect(result.errors).toMatchObject({ topic: expect.any(String), chapters: expect.any(String), template: expect.any(String), depth: expect.any(String), exercises: expect.any(String), selectedModuleIds: expect.any(String) })
  })
})

it('recognizes the handout specification version', () => {
  expect(isHandoutSpec({ schema: 'course-handout/1', meta: { title: '讲义' }, modules: [] })).toBe(true)
  expect(isHandoutSpec({ schema: 'other', meta: { title: '讲义' }, modules: [] })).toBe(false)
})
