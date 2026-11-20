import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

export default function CommunityView({ onOpen }) {
  const [query, setQuery] = useState(''); const [items, setItems] = useState([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  async function load(value = query) { setLoading(true); try { const data = await api.community(value); setItems(data.items || []); setError('') } catch (err) { setError(err.message) } finally { setLoading(false) } }
  useEffect(() => { load('') }, [])
  return <section className="community-page"><div className="stage-heading"><div><span className="eyebrow">公开讲义</span><h1>从别人的讲义里找到新的讲法。</h1><p>浏览用户主动分享的学习资料，按主题寻找可复用的结构。</p></div></div><form className="community-search" onSubmit={(e) => { e.preventDefault(); load() }}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索主题或讲义标题"/><button className="primary">搜索</button></form>{error && <div className="form-error">{error}</div>}{loading ? <div className="empty-state">正在加载社区讲义…</div> : items.length ? <div className="community-grid">{items.map((item) => <button className="community-card" key={item.id} onClick={() => onOpen(item)}><span className="eyebrow">{item.displayName || '匿名分享'}</span><h3>{item.title}</h3><p>{item.spec?.meta?.audience || '面向学习者'}</p><small>{item.spec?.modules?.length || 0} 个模块 · {item.createdAt?.slice(0, 10)}</small></button>)}</div> : <div className="empty-state">还没有找到公开讲义。</div>}</section>
}
