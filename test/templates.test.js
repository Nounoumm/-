import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'

function createPluginTools() {
  const tools = new Map()
  const ctx = {
    effect(register) { register() },
    tools: { register: (tool) => tools.set(tool.name, tool) },
    skills: { register() {} },
  }
  apply(ctx)
  return tools
}

test('handout_templates exposes the four established templates', async () => {
  const tools = createPluginTools()
  const result = await tools.get('handout_templates').execute()

  assert.deepEqual(result.templates.map(({ id, name, chapters }) => [id, name, chapters]), [
    ['standard', '标准教材型', 4],
    ['review', '考前复习型', 4],
    ['project', '项目驱动型', 4],
    ['bilingual', '双语对照型', 4],
  ])
})

test('shared template data matches the plugin template descriptions and chapter shapes', async () => {
  const shared = JSON.parse(await readFile(new URL('../shared/templates.json', import.meta.url), 'utf8'))
  const tools = createPluginTools()
  const exposed = await tools.get('handout_templates').execute()

  assert.deepEqual(Object.keys(shared), exposed.templates.map((template) => template.id))
  for (const template of exposed.templates) {
    const source = shared[template.id]
    assert.equal(source.name, template.name)
    assert.equal(source.description, template.description)
    assert.equal(source.bestFor, template.bestFor)
    assert.equal(source.chapterShape.length, template.chapters)
  }
})

test('handout_scaffold retains the review template chapter structure', async () => {
  const tools = createPluginTools()
  const directory = await mkdtemp(path.join(os.tmpdir(), 'handout-template-test-'))
  const outputPath = path.join(directory, 'review.json')
  try {
    await tools.get('handout_scaffold').execute({
      topic: '测试主题',
      template: 'review',
      chapters: 4,
      exercises: 'basic',
      output_path: outputPath,
    }, {})
    const spec = JSON.parse(await readFile(outputPath, 'utf8'))
    const chapters = spec.modules.flatMap((module) => module.chapters)

    assert.deepEqual(chapters.map((chapter) => chapter.title), [
      '第 1 章　知识地图与考点分布',
      '第 2 章　重点概念速览',
      '第 3 章　题型归纳与模板',
      '第 4 章　易错点与模拟自测',
    ])
    assert.equal(spec.meta.template, 'review')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
