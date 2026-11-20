const templates = ['standard', 'review', 'project', 'bilingual']
const depths = ['concise', 'standard', 'detailed']
const exercises = ['none', 'basic', 'full']

export function validateGenerateInput(input = {}, { requireSelection = true } = {}) {
  const errors = {}
  const topic = String(input.topic || '').trim()
  const audience = String(input.audience || '').trim()
  const chapters = Number(input.chapters)
  const template = input.template || 'standard'
  const depth = input.depth || 'standard'
  const exerciseLevel = input.exercises || 'basic'
  const selectedModuleIds = Array.isArray(input.selectedModuleIds) ? input.selectedModuleIds : []
  if (topic.length < 2 || topic.length > 160) errors.topic = '主题长度应为 2–160 个字符。'
  if (audience.length > 160) errors.audience = '适用对象不能超过 160 个字符。'
  if (!Number.isInteger(chapters) || chapters < 3 || chapters > 12) errors.chapters = '章节数量应为 3–12。'
  if (!templates.includes(template)) errors.template = '请选择有效模板。'
  if (!depths.includes(depth)) errors.depth = '请选择有效内容深度。'
  if (!exercises.includes(exerciseLevel)) errors.exercises = '请选择有效习题规模。'
  if (requireSelection && (!selectedModuleIds.length || new Set(selectedModuleIds).size !== selectedModuleIds.length)) errors.selectedModuleIds = '至少选择一个不重复的模块。'
  return { ok: Object.keys(errors).length === 0, value: { topic, audience, chapters, template, depth, exercises: exerciseLevel, selectedModuleIds }, errors }
}

export function assertSpec(spec) {
  if (!spec || spec.schema !== 'course-handout/1' || !spec.meta?.title || !Array.isArray(spec.modules)) throw new Error('模型返回的讲义规格不完整。')
  return spec
}
