import { useState } from 'react'
import { portableSpec } from '../lib/account-api.js'

export default function ShareEditor({ item, onSave, onClose, busy, error }) {
  const [spec, setSpec] = useState(() => portableSpec(item.spec))
  const [displayName, setDisplayName] = useState(item.displayName || '')
  function updateModule(index, patch) { setSpec((old) => ({ ...old, modules: old.modules.map((module, mi) => mi === index ? { ...module, ...patch } : module) })) }
  function updateChapter(mi, ci, patch) { setSpec((old) => ({ ...old, modules: old.modules.map((module, i) => i === mi ? { ...module, chapters: module.chapters.map((chapter, j) => j === ci ? { ...chapter, ...patch } : chapter) } : module) })) }
  function updateSection(mi, ci, si, patch) { setSpec((old) => ({ ...old, modules: old.modules.map((module, i) => i === mi ? { ...module, chapters: module.chapters.map((chapter, j) => j === ci ? { ...chapter, sections: chapter.sections.map((section, k) => k === si ? { ...section, ...patch } : section) } : chapter) } : module) })) }
  return <div className="dialog-backdrop"><form className="account-dialog form-panel" role="dialog" aria-modal="true" aria-labelledby="share-edit-title" onSubmit={(event) => { event.preventDefault(); onSave({ spec, displayName, tags: item.tags || [], confirmPublic: true }) }}>
    <h2 id="share-edit-title">编辑公开讲义</h2><p>保存后会更新社区中的公开内容，不会更改私人讲义。</p>
    <label>讲义标题<input required maxLength={160} value={spec.meta.title} onChange={(event) => setSpec((old) => ({ ...old, meta: { ...old.meta, title: event.target.value } }))} /></label>
    <label>展示名称<input maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
    {spec.modules.map((module, mi) => <fieldset className="share-edit-module" key={mi}><legend>模块 {mi + 1}</legend><label>模块 {mi + 1} 标题<input required value={module.title} onChange={(event) => updateModule(mi, { title: event.target.value })} /></label>{module.chapters.map((chapter, ci) => <div className="share-edit-chapter" key={ci}><label>第 {ci + 1} 章标题<input required value={chapter.title} onChange={(event) => updateChapter(mi, ci, { title: event.target.value })} /></label>{chapter.sections.map((section, si) => <div key={si}><label>第 {ci + 1}.{si + 1} 节标题<input required value={section.title} onChange={(event) => updateSection(mi, ci, si, { title: event.target.value })} /></label><label>第 {ci + 1}.{si + 1} 节正文<textarea rows={7} value={section.body || ''} onChange={(event) => updateSection(mi, ci, si, { body: event.target.value })} /></label></div>)}</div>)}</fieldset>)}
    <div className="dialog-actions"><button className="primary" disabled={busy} type="submit">确认更新公开内容</button><button disabled={busy} type="button" onClick={onClose}>取消</button></div>{error && <div className="form-error" role="alert">{error}</div>}
  </form></div>
}
