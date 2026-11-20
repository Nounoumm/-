import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AuthDialog from '../components/AuthDialog.jsx'
import { authApi } from '../lib/account-api.js'
vi.mock('../lib/account-api.js', () => ({ authApi: { register: vi.fn(), login: vi.fn(), verify: vi.fn(), reset: vi.fn(), forgot: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('authentication forms', () => {
  it('shows email service configuration errors instead of claiming a verification email was sent', async () => {
    authApi.register.mockRejectedValue(new Error('邮件服务尚未配置。'))
    render(<AuthDialog initialMode="register" onLogin={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@example.com' } }); fireEvent.change(screen.getByLabelText(/密码/), { target: { value: 'very-long-password' } })
    fireEvent.submit(screen.getByRole('button', { name: '注册账号' }).closest('form'))
    expect(await screen.findByRole('alert')).toHaveTextContent('邮件服务尚未配置。'); expect(screen.queryByText(/请查收验证邮件/)).toBeNull()
  })
  it('verification only runs after explicit confirmation and switches to login', async () => {
    authApi.verify.mockResolvedValue({ ok: true })
    render(<AuthDialog initialMode="verify" token="one-use-token" onLogin={() => {}} onClose={() => {}} />)
    expect(authApi.verify).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '验证邮箱' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('邮箱验证成功'))
    expect(authApi.verify).toHaveBeenCalledWith('one-use-token')
  })
})
