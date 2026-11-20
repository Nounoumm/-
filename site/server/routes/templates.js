import templates from '../../../shared/templates.json' with { type: 'json' }
export function templateResponse() { return { templates: Object.entries(templates).map(([id, value]) => ({ id, name: value.name, description: value.description, bestFor: value.bestFor, chapters: value.chapterShape.length })) } }
