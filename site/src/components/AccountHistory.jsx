import { useEffect, useRef, useState } from 'react'
import { cloudFor, downloadJson, portableSpec } from '../lib/account-api.js'
import { getHandout, listHandouts } from '../lib/history-db.js'
import HistoryView from './HistoryView.jsx'
import { listRecovery, removeRecovery } from '../lib/recovery-db.js'

export default function AccountHistory({ user, onOpen, onNew }) {
  const cloudApi = cloudFor(user?.id)
  const [tab, setTab] = useState(user ? 'cloud' : 'local'), [items, setItems] = useState([]), [quota, setQuota] = useState(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [imports, setImports] = useState(null), [selected, setSelected] = useState([]), [notice, setNotice] = useState(''), [recoveries, setRecoveries] = useState([])
  const refreshGeneration = useRef(0)
  const displayedScope = useRef('')
  displayedScope.current = `${user?.id || 'guest'}:${tab}`
  async function refresh() {
    if (!user || tab === 'local') return
    const scope = `${user.id}:${tab}`
    if (scope !== displayedScope.current) return
    const generation = ++refreshGeneration.current
    const isCurrent = () => generation === refreshGeneration.current && scope === displayedScope.current
    setBusy(true); setError('')
    try { const cached = await listRecovery(user.id); const data = await cloudApi.list(tab === 'trash'); if (isCurrent()) { setRecoveries(cached); setItems(data.items); setQuota(data.quota) } } catch (err) { if (isCurrent()) setError(err.message) } finally { if (isCurrent()) setBusy(false) }
  }
  useEffect(() => { setItems([]); refresh(); const onFocus = () => refresh(); window.addEventListener('focus', onFocus); return () => { refreshGeneration.current++; window.removeEventListener('focus', onFocus) } }, [tab, user?.id])
  async function action(fn) { setBusy(true); setError(''); try { await fn(); await refresh() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  async function importSelected() {
    setBusy(true); setError(''); let added = 0, skipped = 0
    try {
      for (const id of selected) {
        const local = await getHandout(id); if (!local) continue
        const result = await cloudApi.import(local.id, portableSpec(local.spec), local.title, local.revisions?.map((rev) => ({ title: rev.title, spec: portableSpec(rev.spec) })))
        result.imported ? added++ : skipped++
      }
      setNotice(`导入完成：新增 ${added} 份，跳过已导入 ${skipped} 份。本机原件保留。`); setImports(null); setSelected([]); await refresh()
    } catch (err) { setError(`导入未全部完成：${err.message} 已完成 ${added} 份，可重试剩余内容。`) } finally { setBusy(false) }
  }
  return <section className="history-page">
    <div className="history-tabs" role="tablist" aria-label="历史保存位置">{user && <button role="tab" aria-selected={tab === 'cloud'} onClick={() => setTab('cloud')}>账号历史</button>}<button role="tab" aria-selected={tab === 'local'} onClick={() => setTab('local')}>本机历史</button>{user && <button role="tab" aria-selected={tab === 'trash'} onClick={() => setTab('trash')}>回收站</button>}</div>
    {tab === 'local' ? <HistoryView onOpen={(record) => onOpen(record, 'local')} onBack={onNew} /> : <>
      <div className="stage-heading"><div><span className="eyebrow">{tab === 'trash' ? '保留 30 天' : '私人账号空间'}</span><h1>{tab === 'trash' ? '回收站' : '账号讲义历史'}</h1><p>{user?.email} · 登录同一账号即可跨设备恢复。</p></div>{tab === 'cloud' && <button disabled={busy} onClick={() => listHandouts().then(setImports).catch((err) => setError(err.message))}>从本机导入</button>}</div>
      {quota && <p className="quota-note">讲义 {quota.count} / {quota.maxCount} 份 · {(quota.bytes / 1024 / 1024).toFixed(1)} / {(quota.maxBytes / 1024 / 1024).toFixed(0)} MiB（包含版本与回收站）</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      {tab === 'cloud' && recoveries.length > 0 && <section className="conflict-panel"><h3>此账号在当前设备有未同步的内容</h3><p>恢复时会检查云端版本，不会直接覆盖其他设备的修改。</p>{recoveries.map((record) => <div className="revision-row" key={record.key}><span>{record.title}</span><div className="toolbar-actions"><button onClick={() => onOpen({ ...record, recoveryKey: record.key }, 'cloud', user.id)}>恢复编辑</button><button onClick={() => downloadJson(record.spec)}>下载备份</button><button onClick={() => { if (window.confirm('删除这份未同步恢复副本？')) removeRecovery(user.id, record.key).then(refresh).catch((err) => setError(err.message)) }}>放弃恢复副本</button></div></div>)}</section>}
      {!items.length && !busy && <div className="empty-state">{tab === 'trash' ? '回收站为空' : '账号中还没有讲义，可以新建或按需导入。'}</div>}
      <div className="history-list">{items.map((item) => <article className="history-row" key={item.id}><div><span className="eyebrow">版本 {item.version} · {new Date(item.updatedAt).toLocaleString('zh-CN')}</span><h3>{item.title}</h3></div><div className="history-actions">{tab === 'trash' ? <><button disabled={busy} onClick={() => action(() => cloudApi.restore(item))}>恢复</button><button className="danger" disabled={busy} onClick={() => { if (window.confirm('永久删除后无法恢复，确认删除？')) action(() => cloudApi.purge(item)) }}>永久删除</button></> : <><button disabled={busy} onClick={() => action(async () => onOpen(await cloudApi.get(item.id), 'cloud', user.id))}>打开</button><button disabled={busy} onClick={() => action(async () => downloadJson((await cloudApi.get(item.id)).spec))}>导出 JSON</button><button disabled={busy} onClick={() => { if (window.confirm('将讲义移入回收站？30 天内可恢复。')) action(() => cloudApi.trash(item)) }}>移入回收站</button></>}</div></article>)}</div>
    </>}{error && <div className="form-error" role="alert">{error}<button onClick={refresh}>刷新重试</button></div>}{busy && <p role="status">正在处理…</p>}
    {imports && <div className="dialog-backdrop"><section className="account-dialog form-panel" role="dialog" aria-modal="true" aria-labelledby="import-title"><h2 id="import-title">选择要上传的本机讲义</h2><p>不会上传原始资料或分享管理链接，也不会删除本机原件。重复导入会跳过。</p>{imports.length ? imports.map((item) => <label className="check-label" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected((values) => e.target.checked ? [...values, item.id] : values.filter((id) => id !== item.id))} />{item.title}</label>) : <p>本机没有可导入的讲义。</p>}<div className="toolbar-actions"><button disabled={busy} onClick={() => setImports(null)}>取消</button><button className="primary" disabled={busy || !selected.length} onClick={importSelected}>导入所选 {selected.length} 份</button></div>{error && <p role="alert">{error}</p>}</section></div>}
  </section>
}
