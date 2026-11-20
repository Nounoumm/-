import { useEffect, useRef, useState } from 'react'
import { api } from './lib/api.js'
import { authApi, downloadJson } from './lib/account-api.js'
import { useDraft } from './lib/use-draft.js'
import AuthDialog from './components/AuthDialog.jsx'
import AccountHistory from './components/AccountHistory.jsx'
import RevisionDialog from './components/RevisionDialog.jsx'
import HandoutReader from './components/HandoutReader.jsx'
import CreateHandout from './components/CreateHandout.jsx'
import CommunityView from './components/CommunityView.jsx'
import PublishDialog from './components/PublishDialog.jsx'
import MyShares from './components/MyShares.jsx'

export default function App() {
  const [user, setUser] = useState(null), [sessionReady, setSessionReady] = useState(false), [templates, setTemplates] = useState([])
  const [page, setPage] = useState('new'), [auth, setAuth] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [check, setCheck] = useState(null), [publish, setPublish] = useState(false), [revisions, setRevisions] = useState(false), [exit, setExit] = useState(false), [publicSpec, setPublicSpec] = useState(null)
  const editing = useDraft(user), userRef = useRef(user), identityEpoch = useRef(0)
  userRef.current = user
  useEffect(() => {
    let mounted = true
    api.templates().then((result) => { if (mounted) setTemplates(result.templates) }).catch((err) => { if (mounted) setError(err.message) })
    const initialEpoch = identityEpoch.current
    authApi.session().then((result) => { if (mounted && initialEpoch === identityEpoch.current) setUser(result.user) }).catch((err) => { if (mounted) setError(`无法检查登录状态：${err.message}`) }).finally(() => { if (mounted) setSessionReady(true) })
    const hash = new URLSearchParams(window.location.hash.slice(1)), verify = hash.get('verify'), reset = hash.get('reset')
    if (verify || reset) { window.history.replaceState(null, '', window.location.pathname + window.location.search); setAuth({ mode: verify ? 'verify' : 'reset', token: verify || reset }) }
    return () => { mounted = false }
  }, [])
  async function guarded(action) { const epoch = identityEpoch.current; setError(''); try { await editing.flush(); if (epoch === identityEpoch.current) await action() } catch (err) { if (epoch === identityEpoch.current) setError(`内容仍保留在当前页面。${err.message}`) } }
  async function navigate(next, create = false) { await guarded(() => { setPage(next); if (create) { editing.close(); setPublicSpec(null); setCheck(null) } }) }
  async function openRecord(record, location, owner) { if (location === 'cloud' && owner !== userRef.current?.id) return; await guarded(() => { if (location === 'cloud' && owner !== userRef.current?.id) return; editing.open(record.spec, { location, record, owner, save: !!record.recoveryKey }); setPublicSpec(null); setPage('new'); setCheck(null) }) }
  const renderIdentityEpoch = identityEpoch.current
  function generated(spec) { if (renderIdentityEpoch !== identityEpoch.current || user?.id !== userRef.current?.id) return; editing.open(spec, { location: user ? 'cloud' : 'local', owner: user?.id, save: true }); setCheck(null) }
  async function login(nextUser) {
    identityEpoch.current++
    if (editing.draft?.location === 'cloud' && editing.draft.owner !== nextUser.id) {
      if (editing.hasPending()) downloadJson(editing.draft.spec)
      await editing.clearRecovery(editing.draft.owner).catch((err) => setError(err.message))
      editing.close(); setPublicSpec(null); setCheck(null)
    } else if (editing.draft?.location === 'local') {
      await editing.flush().catch((err) => { downloadJson(editing.draft.spec); setError(err.message) })
      editing.close()
    }
    setUser(nextUser); setPage('history'); setError('')
  }
  async function logout(mode) {
    setBusy(true); setError('')
    try {
      if (mode === 'save') await editing.flush()
      if (mode === 'backup' && editing.draft) downloadJson(editing.draft.spec)
      const oldOwner = user?.id
      await authApi.logout(); identityEpoch.current++
      try { if (oldOwner) await editing.clearRecovery(oldOwner) } catch (err) { setError(err.message) }
      editing.close(); setUser(null); setPublicSpec(null); setCheck(null); setPublish(false); setRevisions(false); setExit(false); setPage('new')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const spec = editing.draft?.spec || publicSpec
  async function validate() { setBusy(true); setError(''); try { setCheck(await api.check(spec)) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  async function docx() { setBusy(true); setError(''); try { const blob = await api.docx(spec); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${spec.meta.title}.docx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  function update(value) { setCheck(null); if (editing.draft) editing.update(value); else setPublicSpec(value) }
  const saveLabel = { pending: '等待保存', saving: '保存中…', saved: editing.draft?.location === 'cloud' ? '已同步' : '已保存在本机', error: '保存失败 · 内容仍在当前页面' }[editing.state]
  return <div className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark">课</span><span>课程讲义工坊</span></div><nav aria-label="主导航"><button className={page === 'new' ? 'current' : ''} onClick={() => navigate('new', true)}>新建讲义</button><button className={page === 'history' ? 'current' : ''} onClick={() => navigate('history')}>{user ? '讲义历史' : '本机历史'}</button><button className={page === 'community' ? 'current' : ''} onClick={() => navigate('community')}>讲义社区</button></nav><div className="account-menu">{user ? <><span title={user.email}>{user.displayName || user.email}</span><button onClick={() => navigate('shares')}>我的分享</button><button disabled={busy} onClick={() => setExit(true)}>退出</button></> : <button disabled={!sessionReady} onClick={() => setAuth({ mode: 'login' })}>{sessionReady ? '登录 / 注册' : '检查登录状态…'}</button>}</div></header>
    <div className="page-shell">{error && <div role="alert" className="form-error">{error}</div>}
      {editing.draft && <div className="sync-strip"><span>{editing.draft.location === 'cloud' ? `账号私密保存 · ${user?.email || '请重新登录'}` : '仅本机保存'} · <strong role="status">{saveLabel}</strong></span><div className="toolbar-actions"><button onClick={() => downloadJson(editing.draft.spec)}>导出 JSON 备份</button>{editing.state === 'error' && <button onClick={() => guarded(() => {})}>重试保存</button>}{editing.draft.location === 'cloud' && editing.draft.id && <button onClick={() => guarded(() => setRevisions(true))}>修订版本</button>}</div></div>}
      {editing.error && <div className="form-error" role="alert">{editing.error.message}{editing.error.status === 401 && <button onClick={() => setAuth({ mode: 'login' })}>重新登录</button>}</div>}
      {editing.recoveryError && <p className="form-error" role="alert">{editing.recoveryError}</p>}
      {editing.conflict && <section className="conflict-panel" role="alert"><h3>这份讲义有更新，尚未覆盖云端内容。</h3><p>{editing.conflict.deletedAt ? '讲义已在另一设备删除。当前内容可以另存为副本。' : `云端版本 ${editing.conflict.version} 与当前设备版本不同。请先查看或保存此设备的修改。`}</p><div className="toolbar-actions"><button onClick={() => editing.keepCopy().catch((err) => setError(err.message))}>保留此设备内容为副本</button>{editing.conflict.spec && <><button onClick={() => downloadJson(editing.conflict.spec)}>下载云端版本供比较</button><button onClick={() => { if (window.confirm('读取云端最新版本将替换当前编辑内容。请先导出当前内容或保留为副本。')) editing.useServer() }}>读取云端最新版本</button></>}</div></section>}
      {page === 'shares' && user ? <MyShares key={user.id} user={user} /> : page === 'history' ? <AccountHistory key={user?.id || 'guest'} user={user} onOpen={openRecord} onNew={() => navigate('new', true)} /> : page === 'community' ? <CommunityView onOpen={(record) => guarded(() => { editing.close(); setPublicSpec(record.spec); setPage('new'); setCheck(null) })} /> : spec ? <><HandoutReader spec={spec} onChange={update} check={check} onCheck={validate} onDownload={docx} busy={busy} /><div className="reader-share"><button onClick={() => setPublish(true)}>分享至讲义社区</button><button onClick={() => downloadJson(spec)}>导出 JSON</button>{!editing.draft && <button onClick={() => { editing.open(spec, { location: user ? 'cloud' : 'local', save: true }); setPublicSpec(null) }}>保存为我的讲义</button>}</div></> : <CreateHandout key={user?.id || 'guest'} templates={templates} onGenerated={generated} />}
      {publish && spec && <PublishDialog spec={spec} onClose={() => setPublish(false)} user={user} />}
      {auth && <AuthDialog initialMode={auth.mode} token={auth.token} onLogin={login} onClose={() => setAuth(null)} />}
      {revisions && editing.draft && <RevisionDialog record={editing.draft} owner={editing.draft.owner} onRestored={(record, owner) => { if (userRef.current?.id === owner) editing.open(record.spec, { location: 'cloud', record, owner }) }} onClose={() => setRevisions(false)} />}
      {exit && <div className="dialog-backdrop"><section className="account-dialog form-panel" role="dialog" aria-modal="true" aria-labelledby="logout-title"><h2 id="logout-title">退出账号</h2><p>{editing.hasPending() ? '当前有尚未同步的内容。请选择保存、下载备份后退出，或明确放弃。' : '退出后会清除当前账号的页面内容，本机游客历史仍保留。'}</p><div className="dialog-actions"><button disabled={busy} onClick={() => logout('save')}>{busy ? '正在处理…' : '保存后退出'}</button>{editing.hasPending() && <><button disabled={busy} onClick={() => logout('backup')}>下载 JSON 后退出</button><button className="danger" disabled={busy} onClick={() => { if (window.confirm('明确放弃此设备尚未保存的内容？')) logout('discard') }}>放弃修改并退出</button></>}<button disabled={busy} onClick={() => setExit(false)}>取消</button></div>{error && <div className="form-error" role="alert">{error}</div>}</section></div>}
    </div></div>
}
