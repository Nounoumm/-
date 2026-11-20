export const DEPTHS = ['concise', 'standard', 'detailed']
export const EXERCISES = ['none', 'basic', 'full']

export function validateGenerateInput(input = {}, templateIds = []) {
  const errors = {}
  const topic = String(input.topic || '').trim()
  const audience = String(input.audience || '').trim()
  const chapters = Number(input.chapters)
  const template = input.template || 'standard'
  const depth = input.depth || 'standard'
  const exercises = input.exercises || 'basic'
  const selectedModuleIds = Array.isArray(input.selectedModuleIds) ? input.selectedModuleIds : []

  if (topic.length < 2 || topic.length > 160) errors.topic = '主题长度应为 2–160 个字符。'
  if (audience.length > 160) errors.audience = '适用对象不能超过 160 个字符。'
  if (!Number.isInteger(chapters) || chapters < 3 || chapters > 12) errors.chapters = '章节数量应为 3–12。'
  if (!templateIds.includes(template)) errors.template = '请选择有效模板。'
  if (!DEPTHS.includes(depth)) errors.depth = '请选择有效内容深度。'
  if (!EXERCISES.includes(exercises)) errors.exercises = '请选择有效习题规模。'
  if (!selectedModuleIds.length || new Set(selectedModuleIds).size !== selectedModuleIds.length) {
    errors.selectedModuleIds = '至少选择一个不重复的模块。'
  }
  return { ok: Object.keys(errors).length === 0, value: { topic, audience, chapters, template, depth, exercises, selectedModuleIds }, errors }
}

export function isHandoutSpec(spec) {
  return Boolean(spec && spec.schema === 'course-handout/1' && spec.meta?.title && Array.isArray(spec.modules))
}
