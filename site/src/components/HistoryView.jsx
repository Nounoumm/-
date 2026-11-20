import { useEffect, useState } from 'react'
import { deleteHandout, getHandout, listHandouts, renameHandout, saveHandout } from '../lib/history-db.js'
import { downloadJson, portableSpec } from '../lib/account-api.js'

export default function HistoryView({ onOpen, onBack }) {
  const [items, setItems] = useState([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  const refresh = () => listHandouts().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])
  async function rename(item) { const title = window.prompt('重命名讲义', item.title); if (title?.trim()) { await renameHandout(item.id, title).then(refresh).catch((e) => setError(e.message)) } }
  async function remove(item) { if (window.confirm(`删除“${item.title}”？`)) await deleteHandout(item.id).then(refresh).catch((e) => setError(e.message)) }
  async function restoreJson(file) {
    if (!file) return
    try {
      if (file.size > 1048576) throw new Error('JSON 备份不能超过 1 MiB。')
      const parsed = JSON.parse(await file.text())
      if (parsed.schema !== 'course-handout/1' || !parsed.meta?.title || !Array.isArray(parsed.modules)) throw new Error('文件不是有效的讲义 JSON 备份。')
      const spec = portableSpec(parsed)
      await saveHandout({ id: crypto.randomUUID(), title: spec.meta.title, topic: spec.meta.title, updatedAt: new Date().toISOString(), checkStatus: 'unchecked', spec }); await refresh()
    } catch (err) { setError(err.message) }
  }
  return <section className="history-page"><div className="stage-heading"><div><span className="eyebrow">本机保存</span><h1>你的讲义历史。</h1><p>内容只保存在这个浏览器里，只有主动导入后才会上传到账号。</p></div><button onClick={onBack}>新建讲义</button></div><label className="json-import">从 JSON 备份恢复到本机<input type="file" accept=".json,application/json" onChange={(e) => restoreJson(e.target.files[0])} /></label>{error && <div className="form-error">{error}</div>}{loading ? <div className="empty-state">正在读取本机历史…</div> : !items.length ? <div className="empty-state"><strong>还没有保存的讲义</strong><span>生成第一份讲义后，它会自动出现在这里。</span></div> : <div className="history-list">{items.map((item) => <article className="history-row" key={item.id}><div><span className="eyebrow">{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</span><h3>{item.title}</h3><p>{item.topic}</p></div><div className="history-actions"><button onClick={() => getHandout(item.id).then(onOpen).catch((e) => setError(e.message))}>打开</button><button onClick={() => rename(item)}>重命名</button><button onClick={() => getHandout(item.id).then((record) => downloadJson(record.spec)).catch((err) => setError(err.message))}>导出 JSON</button><button className="danger" onClick={() => remove(item)}>删除</button></div></article>)}</div>}</section>
}
