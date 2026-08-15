import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'

function kes(cents) {
  return `KES ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

const CATEGORY_LABELS = {
  infrastructure: 'Infrastructure',
  payment_processing_fees: 'Payment processing fees',
  marketing: 'Marketing',
  salaries: 'Salaries',
  other: 'Other',
}

function StatementRow({ label, value, bold, muted, divider, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '10px 0',
      borderTop: divider ? '1px solid var(--line)' : 'none',
      fontWeight: bold ? 700 : 400,
      fontSize: bold ? 15 : 13,
      color: muted ? 'var(--slate)' : 'var(--paper)',
    }}>
      <span>{label}</span>
      <span style={{ color: color || 'inherit' }}>{value}</span>
    </div>
  )
}

export default function AdminFinanceIncomeStatement() {
  const [start, setStart] = useState(firstOfMonth())
  const [end, setEnd] = useState(today())
  const [statement, setStatement] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ category: 'infrastructure', description: '', amount: '', incurred_at: today() })
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api.adminIncomeStatement(start, end).then(setStatement).catch((err) => setError(err.message))
    api.adminListExpenses(start, end).then(setExpenses).catch(() => setExpenses([]))
  }, [start, end])

  useEffect(() => { load() }, [load])

  async function handleAddExpense(e) {
    e.preventDefault()
    setError(null)
    const amountCents = Math.round(parseFloat(expenseForm.amount) * 100)
    if (!expenseForm.description.trim() || !amountCents || amountCents <= 0) {
      setError('Enter a description and a valid amount.')
      return
    }
    try {
      await api.adminCreateExpense({
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        amount_cents: amountCents,
        incurred_at: expenseForm.incurred_at,
      })
      setExpenseForm({ category: 'infrastructure', description: '', amount: '', incurred_at: today() })
      setShowAddExpense(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteExpense(id) {
    if (!confirm('Delete this expense entry?')) return
    try {
      await api.adminDeleteExpense(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!statement) return <p style={{ color: 'var(--slate)' }}>Loading…</p>

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' }}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, color: 'var(--paper)', fontSize: 12 }} />
        <span style={{ color: 'var(--slate)', fontSize: 12 }}>to</span>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, color: 'var(--paper)', fontSize: 12 }} />
      </div>

      {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}

      <div className="report-card" style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
          INCOME STATEMENT · {statement.period.start} TO {statement.period.end}
        </div>

        <StatementRow label="Gross collections" value={kes(statement.gross_collections_cents)} />
        <StatementRow label="  Pass purchases" value={kes(statement.pass_purchase_cents)} muted />
        <StatementRow label="  Paid hangout joins" value={kes(statement.hangout_join_cents)} muted />

        <StatementRow label="Less: host payouts owed" value={`(${kes(statement.host_payouts_owed_cents)})`} divider color="var(--coral)" />
        <StatementRow label="Platform revenue" value={kes(statement.platform_revenue_cents)} bold divider />

        <StatementRow label="Less: operating expenses" value={`(${kes(statement.total_expenses_cents)})`} divider color="var(--coral)" />
        {Object.entries(statement.expenses_by_category_cents).map(([cat, cents]) => (
          <StatementRow key={cat} label={`  ${CATEGORY_LABELS[cat] || cat}`} value={`(${kes(cents)})`} muted />
        ))}

        <StatementRow
          label="Net income"
          value={kes(statement.net_income_cents)}
          bold
          divider
          color={statement.net_income_cents >= 0 ? 'var(--lime)' : 'var(--coral)'}
        />

        <p style={{ fontSize: 10, color: 'var(--slate)', marginTop: 14, lineHeight: 1.5 }}>
          Host payouts are the ~{Math.round((1 - statement.platform_fee_pct) * 100)}% of paid-hangout
          revenue that belongs to hosts, not Juana — excluded from revenue as a pass-through, not an expense.
        </p>
      </div>

      <div className="report-card" style={{ maxWidth: 480 }}>
        <div className="panel-head" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Expense log</span>
          <button className="btn-dismiss" onClick={() => setShowAddExpense(!showAddExpense)}>
            {showAddExpense ? 'Cancel' : '+ Add expense'}
          </button>
        </div>

        {showAddExpense && (
          <form onSubmit={handleAddExpense} style={{ marginBottom: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 12 }}>
            <select
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              style={{ width: '100%', marginBottom: 8, background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, color: 'var(--paper)', fontSize: 12 }}
            >
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
            <input
              type="text" placeholder="Description" value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              style={{ width: '100%', marginBottom: 8, background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, color: 'var(--paper)', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                type="number" step="0.01" placeholder="Amount (KES)" value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, color: 'var(--paper)', fontSize: 12 }}
              />
              <input
                type="date" value={expenseForm.incurred_at}
                onChange={(e) => setExpenseForm({ ...expenseForm, incurred_at: e.target.value })}
                style={{ background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, color: 'var(--paper)', fontSize: 12 }}
              />
            </div>
            <button type="submit" className="btn-ban" style={{ background: 'var(--lime)', color: 'var(--ink)', width: '100%' }}>
              Save expense
            </button>
          </form>
        )}

        {expenses.length === 0 && <p style={{ color: 'var(--slate)', fontSize: 12 }}>No expenses logged for this period.</p>}
        {expenses.map((e) => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontSize: 13 }}>{e.description}</div>
              <div style={{ fontSize: 10, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>
                {CATEGORY_LABELS[e.category]} · {e.incurred_at}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--coral)' }}>{kes(e.amount_cents)}</span>
              <button onClick={() => handleDeleteExpense(e.id)} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
