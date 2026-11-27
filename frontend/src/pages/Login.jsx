import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { getPendingInviteHangoutId } from '../utils/invite'
import './Login.css'

export default function Login() {
  const location = useLocation()
  const [mode, setMode] = useState(location.pathname === '/register' ? 'register' : 'login')
  const [form, setForm] = useState({ email: '', password: '', display_name: '', birthdate: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = mode === 'login' ? await api.login(form) : await api.register(form)
      setToken(data.token)
      // If they arrived via a hangout invite link (see pages/Invite.jsx), send
      // them straight there instead of the generic dashboard — that's the
      // whole point of the invite; landing on Dashboard first would lose the thread.
      const pendingHangoutId = getPendingInviteHangoutId()
      navigate(pendingHangoutId ? `/hangouts/${pendingHangoutId}` : '/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-back">← Back to Juana</Link>

        <div className="auth-logo"><span className="logo-dot"></span>Juana</div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Join free'}</h1>
        <p className="sub">
          {mode === 'login'
            ? 'Log in to see what\'s happening near you.'
            : 'No credit card, ready in 2 minutes.'}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="auth-field">
                <label>Display name</label>
                <input
                  placeholder="What people will see"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                />
              </div>
              <div className="auth-field">
                <label>Birthdate</label>
                <input
                  type="date"
                  value={form.birthdate}
                  onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'One sec…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <button className="auth-switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? "Need an account? Join free →" : 'Already on Juana? Log in →'}
        </button>
      </div>
    </div>
  )
}
