import templates from '../../../shared/templates.json' with { type: 'json' }
import { requestJson } from './deepseek.js'
import { assertSpec } from '../lib/validation.js'

function chapterShape(input) {
  const tpl = templates[input.template] || templates.standard
  const count = Math.max(3, Math.min(12, input.chapters || 6)); const result = []
  for (let index = 0; index < count; index++) { const seed = tpl.chapterShape[index % tpl.chapterShape.length]; result.push({ id: `chapter-${index + 1}`, title: `第 ${index + 1} 章　${seed[0]}`, sections: seed[1].map((title, section) => ({ id: `section-${index + 1}-${section + 1}`, title: `${index + 1}.${section + 1}　${title}` })) }) }
  return result
}

export function createLocalOutline(input) {
  const chapters = chapterShape(input); const moduleSize = Math.max(2, Math.ceil(chapters.length / 2)); const modules = []
  for (let start = 0; start < chapters.length; start += moduleSize) modules.push({ id: `module-${modules.length + 1}`, title: modules.length ? '第二部分　方法与应用' : '第一部分　基础与直觉', description: '围绕本阶段的学习目标组织章节。', chapters: chapters.slice(start, start + moduleSize) })
  return { schema: 'course-handout/outline/1', meta: { title: input.topic, audience: input.audience, template: input.template }, modules }
}

export async function generateHandout(input, outline, materialText, signal, onProgress) {
  const modules = []
  for (const module of outline.modules.filter((item) => input.selectedModuleIds.includes(item.id))) {
    onProgress?.({ moduleId: module.id, title: module.title, status: 'generating' })
    const generated = await requestJson([{ role: 'system', content: '你是课程讲义编辑。只返回符合 course-handout/1 的 JSON 对象。' }, { role: 'user', content: JSON.stringify({ task: '根据主题、学习对象、模块大纲和参考资料生成一个完整模块。内容深度必须遵守 depth；资料未覆盖的补充内容请用“补充说明”标注。', input, module, materialText: materialText.slice(0, 100000) }) }], signal)
    if (!generated.modules?.length) throw new Error(`模块 ${module.title} 没有返回有效内容。`)
    modules.push(generated.modules[0]); onProgress?.({ moduleId: module.id, title: module.title, status: 'complete' })
  }
  return assertSpec({ schema: 'course-handout/1', meta: { title: input.topic, subtitle: '模块化学习讲义', audience: input.audience || '学习者', template: input.template, include_toc: true, include_answers: input.exercises !== 'none' }, modules, appendix: { glossary: [], references: [] } })
}
