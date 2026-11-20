import { useEffect, useState } from 'react'
import { authApi } from '../lib/account-api.js'

export default function AuthDialog({ initialMode = 'login', token = '', onLogin, onClose }) {
  const [mode, setMode] = useState(initialMode), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const labels = { login: '登录账号', register: '注册账号', forgot: '找回密码', reset: '设置新密码', verify: '验证邮箱' }
  useEffect(() => { document.getElementById('auth-title')?.focus() }, [])
  function switchMode(next) { setMode(next); setError(''); setMessage(''); setPassword('') }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'login') { const result = await authApi.login({ email, password }); await onLogin(result.user); onClose(); return }
      if (mode === 'register') { const result = await authApi.register({ email, password, displayName }); setMessage(result.message || '请查收验证邮件，完成验证后再登录。'); setPassword('') }
      if (mode === 'forgot') { const result = await authApi.forgot(email); setMessage(result.message || '如果该邮箱可用，我们已发送重置邮件。') }
      if (mode === 'reset') { await authApi.reset(token, password); setPassword(''); setMode('login'); setMessage('密码已重置，请重新登录。') }
      if (mode === 'verify') { await authApi.verify(token); setMode('login'); setMessage('邮箱验证成功，请登录。') }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="dialog-backdrop" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose() }}><section className="account-dialog form-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button type="button" className="dialog-close" aria-label="关闭登录窗口" onClick={onClose} disabled={busy}>×</button>
    <span className="eyebrow">私人讲义 · 跨设备同步</span><h2 id="auth-title" tabIndex={-1}>{labels[mode]}</h2>
    <p>游客仍可直接使用。本机历史只在你主动导入时上传。</p>
    <form onSubmit={submit}>
      {['login', 'register', 'forgot'].includes(mode) && <label>邮箱<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
      {mode === 'register' && <label>显示名称（可选）<input autoComplete="nickname" maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>}
      {['login', 'register', 'reset'].includes(mode) && <label>密码<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />{mode !== 'login' && <small>至少 12 个字符，最多 128 个字符。</small>}</label>}
      {mode === 'verify' && <p>点击下方按钮完成邮箱验证。验证链接只能使用一次。</p>}
      {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
      <button className="primary wide" disabled={busy}>{busy ? '正在处理…' : labels[mode]}</button>
    </form>
    <div className="auth-links">{mode !== 'login' && <button onClick={() => switchMode('login')}>返回登录</button>}{mode === 'login' && <><button onClick={() => switchMode('register')}>注册新账号</button><button onClick={() => switchMode('forgot')}>忘记密码</button></>}</div>
  </section></div>
}
