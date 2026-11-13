import { useEffect, useState } from 'react'
import { api } from '../api/client'

/**
 * Just the SasaPay credentials form — Collections, Cashflow, and Income
 * Statement are sibling tabs in AdminFinance.jsx, all reading through this
 * same config once it's saved here.
 */
export default function AdminFinanceSettings() {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({ base_url: '', callback_base_url: '', client_id: '', client_secret: '', merchant_code: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  function load() {
    api.adminGetSasaPaySettings().then((s) => {
      setSettings(s)
      setForm({
        base_url: s.base_url || '',
        callback_base_url: s.callback_base_url || '',
        client_id: '', // never pre-filled with the masked value — see form note below
        client_secret: '',
        merchant_code: '',
      })
    }).catch((err) => setError(err.message))
  }

  useEffect(() => { load() }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    setTestResult(null)
    try {
      await api.adminUpdateSasaPaySettings(form)
      setSaved(true)
      load() // refresh masked values + "configured"/"source" status
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.adminTestSasaPayConnection()
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, message: err.message })
    } finally {
      setTesting(false)
    }
  }

  if (!settings) return <p style={{ color: 'var(--slate)' }}>Loading…</p>

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="report-card">
        <div className="report-card-head">
          <span className="report-reason" style={{ background: settings.configured ? 'rgba(198,241,53,0.12)' : undefined, color: settings.configured ? 'var(--lime)' : undefined }}>
            {settings.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
          </span>
          <span className="report-time">
            SOURCE: {settings.source === 'database' ? 'SAVED IN APP' : 'ENV FILE (.env)'}
          </span>
        </div>

        {settings.source === 'environment' && (
          <p style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 16, lineHeight: 1.6 }}>
            Currently running on whatever's in the backend's .env file. Saving this form switches
            over to using these credentials instead — .env values are only a first-time bootstrap.
          </p>
        )}

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
              ENVIRONMENT
            </label>
            <select
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, color: 'var(--paper)', fontSize: 13 }}
            >
              <option value="https://sandbox.sasapay.app">Sandbox</option>
              <option value="https://api.sasapay.app">Production</option>
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
              CLIENT ID {settings.client_id && <span style={{ color: 'var(--lime)' }}>(current: {settings.client_id})</span>}
            </label>
            <input
              type="text"
              placeholder={settings.client_id ? 'Leave blank to keep current' : 'From SasaPay developer portal'}
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, color: 'var(--paper)', fontSize: 13 }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
              CLIENT SECRET {settings.client_secret && <span style={{ color: 'var(--lime)' }}>(current: {settings.client_secret})</span>}
            </label>
            <input
              type="password"
              placeholder={settings.client_secret ? 'Leave blank to keep current' : 'From SasaPay developer portal'}
              value={form.client_secret}
              onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, color: 'var(--paper)', fontSize: 13 }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
              MERCHANT CODE {settings.merchant_code && <span style={{ color: 'var(--lime)' }}>(current: {settings.merchant_code})</span>}
            </label>
            <input
              type="text"
              placeholder={settings.merchant_code ? 'Leave blank to keep current' : 'From SasaPay developer portal'}
              value={form.merchant_code}
              onChange={(e) => setForm({ ...form, merchant_code: e.target.value })}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, color: 'var(--paper)', fontSize: 13 }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>
              CALLBACK URL (must be publicly reachable — ngrok in dev, your real domain in prod)
            </label>
            <input
              type="text"
              placeholder="https://your-domain.com"
              value={form.callback_base_url}
              onChange={(e) => setForm({ ...form, callback_base_url: e.target.value })}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, color: 'var(--paper)', fontSize: 13 }}
            />
            {(() => {
              // The #1 reason a payment sits "pending" forever: SasaPay can't reach this address.
              const base = (form.callback_base_url || '').trim().replace(/\/+$/, '')
              if (!base) return null
              const local = /localhost|127\.0\.0\.1/.test(base)
              const tunnel = /ngrok|loca\.lt|trycloudflare/.test(base)
              return (
                <p style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6, color: local ? 'var(--coral)' : 'var(--slate)' }}>
                  SasaPay will confirm payments at <code>{base}/api/webhooks/sasapay/collection</code>
                  {local && ' — SasaPay cannot reach localhost, so every payment will stay pending forever.'}
                  {tunnel && ' — this is a temporary tunnel address. It changes whenever the tunnel restarts, and payments stay pending until you update it here.'}
                </p>
              )
            })()}
          </div>

          {saved && <p style={{ color: 'var(--lime)', fontSize: 12, marginBottom: 12 }}>✓ Saved</p>}
          {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn-ban" style={{ background: 'var(--lime)', color: 'var(--ink)' }} disabled={saving}>
              {saving ? 'Saving…' : 'Save credentials'}
            </button>
            <button type="button" className="btn-dismiss" onClick={handleTest} disabled={testing || !settings.configured}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          </div>

          {testResult && (
            <p style={{ fontSize: 12, marginTop: 12, color: testResult.success ? 'var(--lime)' : 'var(--coral)' }}>
              {testResult.success ? '✓' : '✕'} {testResult.message}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
