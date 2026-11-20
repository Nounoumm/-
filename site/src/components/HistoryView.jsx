import { useEffect, useState } from 'react'
import { deleteHandout, getHandout, listHandouts, renameHandout } from '../lib/history-db.js'

export default function HistoryView({ onOpen, onBack }) {
  const [items, setItems] = useState([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  const refresh = () => listHandouts().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false))
  useEffect(refresh, [])
  async function rename(item) { const title = window.prompt('重命名讲义', item.title); if (title?.trim()) { await renameHandout(item.id, title).then(refresh).catch((e) => setError(e.message)) } }
  async function remove(item) { if (window.confirm(`删除“${item.title}”？`)) await deleteHandout(item.id).then(refresh).catch((e) => setError(e.message)) }
  return <section className="history-page"><div className="stage-heading"><div><span className="eyebrow">本机保存</span><h1>你的讲义历史。</h1><p>内容只保存在这个浏览器里，关闭同步不会上传到服务器。</p></div><button onClick={onBack}>新建讲义</button></div>{error && <div className="form-error">{error}</div>}{loading ? <div className="empty-state">正在读取本机历史…</div> : !items.length ? <div className="empty-state"><strong>还没有保存的讲义</strong><span>生成第一份讲义后，它会自动出现在这里。</span></div> : <div className="history-list">{items.map((item) => <article className="history-row" key={item.id}><div><span className="eyebrow">{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</span><h3>{item.title}</h3><p>{item.topic}</p></div><div className="history-actions"><button onClick={() => getHandout(item.id).then(onOpen).catch((e) => setError(e.message))}>打开</button><button onClick={() => rename(item)}>重命名</button><button className="danger" onClick={() => remove(item)}>删除</button></div></article>)}</div>}</section>
}
