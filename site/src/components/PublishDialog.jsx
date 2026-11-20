import { useState } from 'react'
import { api } from '../lib/api.js'

export default function PublishDialog({ spec, onClose }) {
  const [name, setName] = useState(''); const [confirmed, setConfirmed] = useState(false); const [result, setResult] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function publish() { if (!confirmed) return; setBusy(true); try { setResult(await api.publish({ spec, displayName: name })) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose} aria-label="关闭">×</button>{result ? <><span className="eyebrow">已发布</span><h2>请保存管理链接</h2><p>这个链接只显示一次，之后可用于编辑或撤回分享。</p><code>{`${window.location.origin}/community/manage#${result.id}.${result.manageToken}`}</code><button className="primary wide" onClick={onClose}>完成</button></> : <><span className="eyebrow">发布到社区</span><h2>分享这份讲义</h2><p>发布后任何人都可以查看这份讲义。请确认你拥有资料的分享权限。</p><label>展示名称（可选）<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：王老师" /></label><label className="check-line"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> 我确认内容可以公开分享</label><button className="primary wide" disabled={!confirmed || busy} onClick={publish}>{busy ? '正在发布…' : '确认发布'}</button>{error && <div className="form-error">{error}</div>}</>}</div></div>
}
