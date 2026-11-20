import { useEffect, useState } from 'react'
import { cloudFor } from '../lib/account-api.js'
export default function RevisionDialog({ record, owner, onRestored, onClose }) {
  const cloudApi = cloudFor(owner)
  const [items, setItems] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { cloudApi.revisions(record.id).then((value) => setItems(value.items)).catch((err) => setError(err.message)) }, [record.id])
  async function restore(version) {
    if (!window.confirm(`恢复版本 ${version}？恢复会生成一个新版本。`)) return
    setBusy(true); setError('')
    try { onRestored(await cloudApi.restoreRevision(record.id, version, record.version), owner); onClose() } catch (err) { setError(err.status === 409 ? '这份讲义已在其他设备更新，请关闭窗口并重新打开最新版本。' : err.message) } finally { setBusy(false) }
  }
  return <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="revision-title" className="account-dialog form-panel"><h2 id="revision-title">修订版本</h2><p>最多保留最近 20 个成功保存的版本。</p>{items.map((item) => <div className="revision-row" key={item.version}><span>版本 {item.version} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span><button disabled={busy} onClick={() => restore(item.version)}>恢复</button></div>)}{error && <p role="alert" className="form-error">{error}</p>}<button disabled={busy} onClick={onClose}>关闭</button></section></div>
}
