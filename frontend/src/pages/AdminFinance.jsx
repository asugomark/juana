import { useState } from 'react'
import AdminFinanceSettings from './AdminFinanceSettings'
import AdminFinanceCollections from './AdminFinanceCollections'
import AdminFinanceCashflow from './AdminFinanceCashflow'
import AdminFinanceIncomeStatement from './AdminFinanceIncomeStatement'

export default function AdminFinance() {
  const [subTab, setSubTab] = useState('collections')

  const tabs = [
    { key: 'collections', label: 'Collections' },
    { key: 'cashflow', label: 'Cashflow' },
    { key: 'income', label: 'Income Statement' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <div>
      <div className="admin-tabs" style={{ marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`admin-tab ${subTab === t.key ? 'active' : ''}`}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'collections' && <AdminFinanceCollections />}
      {subTab === 'cashflow' && <AdminFinanceCashflow />}
      {subTab === 'income' && <AdminFinanceIncomeStatement />}
      {subTab === 'settings' && <AdminFinanceSettings />}
    </div>
  )
}
