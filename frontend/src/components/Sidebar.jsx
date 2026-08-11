import { Link, useNavigate } from 'react-router-dom'
import { clearToken } from '../api/client'
import { photoStyle } from '../utils/avatar'

/**
 * Every "hub" page (Dashboard, Hola inbox, Nearby, Earnings) renders this
 * instead of copy-pasting the sidebar markup. That duplication is exactly
 * how the Hola/Nearby links ended up broken in the first place — each copy
 * had to be updated by hand and one of them wasn't. One component, one
 * place to fix.
 */
export default function Sidebar({ active, me, unreadCount = 0 }) {
  const navigate = useNavigate()
  const items = [
    { key: 'home', to: '/dashboard', icon: '⌂', label: 'Home' },
    { key: 'hangouts', to: '/hangouts', icon: '◑', label: 'Hangouts' },
    { key: 'hola', to: '/hola', icon: '◐', label: 'Hola', badge: unreadCount },
    { key: 'nearby', to: '/nearby', icon: '◎', label: 'Nearby' },
    { key: 'earnings', to: '/earnings', icon: '$', label: 'Earnings' },
  ]

  function handleLogout() {
    clearToken()
    navigate('/')
  }

  return (
    <aside className="sidebar">
      <div className="logo"><span className="logo-dot"></span>Juana</div>
      <nav className="nav-group">
        {items.map((item) => (
          <Link key={item.key} to={item.to} className={`nav-item ${active === item.key ? 'active' : ''}`}>
            <span className="ic">{item.icon}</span>{item.label}
            {item.badge > 0 && <span className="badge">{item.badge}</span>}
          </Link>
        ))}
        {me && (
          <Link to={`/profile/${me.id}`} className={`nav-item ${active === 'profile' ? 'active' : ''}`}>
            <span className="ic">☰</span>Profile
          </Link>
        )}
        {me?.is_admin && (
          <Link to="/admin" className={`nav-item ${active === 'admin' ? 'active' : ''}`} style={{ color: 'var(--coral)' }}>
            <span className="ic">🛡</span>Moderation
          </Link>
        )}
      </nav>
      <div className="sidebar-spacer"></div>
      {me && (
        <div className="profile-mini">
          <div className={`avatar ${me.nearby_visible ? 'on' : ''}`} style={photoStyle(me)}></div>
          <div>
            <div className="name">{me.display_name}</div>
            <div className="status">{me.nearby_visible ? '● visible nearby' : me.is_verified ? '✓ verified' : ''}</div>
          </div>
        </div>
      )}
      <button
        onClick={handleLogout}
        style={{
          marginTop: 12, background: 'none', border: 'none', color: 'var(--slate)',
          fontSize: 12, fontFamily: "'Space Mono', monospace", textAlign: 'left', padding: '10px 12px',
          cursor: 'pointer',
        }}
      >
        Log out
      </button>
    </aside>
  )
}
