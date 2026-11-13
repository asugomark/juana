import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api/client'
import { photoStyle } from '../utils/avatar'
import { isInstallAvailable, onInstallAvailabilityChange, isIos, isStandalone, promptInstall } from '../utils/pwaInstall'
import Icon from './NavIcons'
import './Sidebar.css'

/**
 * One navigation component, three presentations — CSS-toggled at the same
 * 1000px breakpoint so there is never a moment with both, or neither:
 *   1. Desktop: left sidebar (unchanged).
 *   2. Mobile: slim top bar (menu, logo, bell, avatar) + slide-out drawer
 *      (nearby on/off, Home, admin, install app, log out).
 *   3. Mobile: fixed bottom tab bar — Hola, Hangouts, Nearby, Earnings, Profile.
 *
 * Props
 *   active       which tab to highlight ('home' | 'hola' | 'hangouts' | ...)
 *   me           the signed-in user (may be null while loading)
 *   mobileOnly   skip the desktop <aside> — for pages with their own desktop layout
 *   hideTopbar   skip the mobile top bar + drawer — for pages that already have
 *                their own header (Profile, chat screens). Bottom tabs always render.
 *   unreadCount  DEPRECATED, ignored. The badge is now computed here so it's
 *                identical on every page (see awaitingReply below).
 *
 * No portal: position:fixed ignores the parent's grid/flex layout wherever it
 * sits in the DOM, and moving the desktop <aside> out of .app's grid is exactly
 * what collapsed page content into the 240px sidebar column.
 */
export default function Sidebar({ active, me, mobileOnly = false, hideTopbar = false }) {
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [nearbyOn, setNearbyOn] = useState(!!me?.nearby_visible)
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const [canInstall, setCanInstall] = useState(isInstallAvailable())
  const [awaitingReply, setAwaitingReply] = useState(0)

  useEffect(() => setNearbyOn(!!me?.nearby_visible), [me?.nearby_visible])
  useEffect(() => onInstallAvailabilityChange(setCanInstall), [])

  // "Needs your reply" count: Hola threads whose latest message is from the
  // other person. The backend has no read-receipts yet, so this is a proxy for
  // "new messages" — it clears when you reply, not when you merely open a thread.
  useEffect(() => {
    if (!me?.id) return
    let cancelled = false
    api.holaInbox()
      .then((threads) => {
        if (!cancelled) setAwaitingReply(threads.filter((t) => t.last_message_is_mine === false).length)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [me?.id])

  // Lock page scroll behind the open drawer.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  // While typing, the on-screen keyboard already eats half the screen — slide the
  // tab bar away so it doesn't float above the keyboard and cover the chat composer.
  useEffect(() => {
    let timer
    const isField = (el) => el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
    const onIn = (e) => { if (isField(e.target)) { clearTimeout(timer); document.documentElement.classList.add('kbd-open') } }
    const onOut = () => { timer = setTimeout(() => document.documentElement.classList.remove('kbd-open'), 120) }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
      clearTimeout(timer)
      document.documentElement.classList.remove('kbd-open')
    }
  }, [])

  const sidebarItems = [
    { key: 'home', to: '/dashboard', icon: '⌂', label: 'Home' },
    { key: 'hangouts', to: '/hangouts', icon: '◑', label: 'Hangouts' },
    { key: 'hola', to: '/hola', icon: '◐', label: 'Hola', badge: awaitingReply },
    { key: 'nearby', to: '/nearby', icon: '◎', label: 'Nearby' },
    { key: 'earnings', to: '/earnings', icon: '$', label: 'Earnings' },
  ]

  // The five requested tabs. Home lives in the drawer: with these five one tap
  // away, Home's job ("overview of everything") fits the menu better than a 6th icon.
  const bottomTabs = [
    { key: 'hola', to: '/hola', icon: 'hola', label: 'Hola', badge: awaitingReply },
    { key: 'hangouts', to: '/hangouts', icon: 'hangouts', label: 'Hangouts' },
    { key: 'nearby', to: '/nearby', icon: 'nearby', label: 'Nearby' },
    { key: 'earnings', to: '/earnings', icon: 'earnings', label: 'Earnings' },
    { key: 'profile', to: me ? `/profile/${me.id}` : '/dashboard', icon: 'profile', label: 'Profile' },
  ]

  function handleLogout() {
    clearToken()
    navigate('/')
  }

  function closeDrawer() { setDrawerOpen(false) }

  async function handleToggleNearby() {
    setNearbyBusy(true)
    try {
      if (nearbyOn) {
        await api.endNearby()
        setNearbyOn(false)
      } else {
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        )
        await api.startNearby(position.coords.latitude, position.coords.longitude)
        setNearbyOn(true)
      }
    } catch (err) {
      alert(err.message || 'Could not update location — check location permissions')
    } finally {
      setNearbyBusy(false)
    }
  }

  async function handleInstallClick() {
    if (isIos() && !canInstall) {
      alert('On iPhone: tap the Share button, then "Add to Home Screen".')
      return
    }
    await promptInstall()
  }

  const showInstall = !isStandalone() && (canInstall || isIos())

  return (
    <>
      {/* ---------- Desktop sidebar ---------- */}
      {!mobileOnly && (
        <aside className="sidebar">
          <div className="logo"><span className="logo-dot"></span>Juana</div>
          <nav className="nav-group">
            {sidebarItems.map((item) => (
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
      )}

      {/* ---------- Mobile top bar + drawer ---------- */}
      {!hideTopbar && (
        <>
          <header className="mobile-topbar">
            <button className="mobile-icon-btn" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
              <Icon name="menu" size={20} />
              {me?.is_admin && <span className="mobile-dot"></span>}
            </button>
            <div className="logo"><span className="logo-dot"></span>Juana</div>
            <div className="mobile-topbar-right">
              <Link to="/hola" className="mobile-icon-btn" aria-label="Messages waiting for a reply">
                <Icon name="bell" size={20} />
                {awaitingReply > 0 && <span className="mobile-icon-badge">{awaitingReply > 9 ? '9+' : awaitingReply}</span>}
              </Link>
              <Link to={me ? `/profile/${me.id}` : '/dashboard'} aria-label="Profile">
                <div className="avatar mobile-avatar" style={photoStyle(me)}></div>
              </Link>
            </div>
          </header>

          <div className={`mobile-drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={closeDrawer}></div>
          <aside className={`mobile-drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
            <button className="drawer-close" aria-label="Close menu" onClick={closeDrawer}>
              <Icon name="close" size={16} />
            </button>
            <div className="logo"><span className="logo-dot"></span>Juana</div>

            {me && (
              <div className="profile-mini drawer-profile">
                <div className={`avatar ${nearbyOn ? 'on' : ''}`} style={photoStyle(me)}></div>
                <div>
                  <div className="name">{me.display_name}</div>
                  <div className="status">{nearbyOn ? '● visible nearby' : me.is_verified ? '✓ verified' : ''}</div>
                </div>
              </div>
            )}

            <div className="drawer-location-row">
              <div>
                <div className="drawer-location-label">Nearby visibility</div>
                <div className="drawer-location-sub">{nearbyOn ? 'Visible this session' : 'Not visible'}</div>
              </div>
              <button
                className={`drawer-switch ${nearbyOn ? 'on' : ''}`}
                onClick={handleToggleNearby}
                disabled={nearbyBusy}
                role="switch"
                aria-checked={nearbyOn}
                aria-label="Toggle nearby visibility"
              ><span /></button>
            </div>

            <div className="drawer-links" role="navigation" aria-label="Menu">
              <Link to="/dashboard" className={`drawer-link ${active === 'home' ? 'active' : ''}`} onClick={closeDrawer}>
                <Icon name="home" size={20} />Home
              </Link>
              {me?.is_admin && (
                <Link to="/admin" className="drawer-link danger" onClick={closeDrawer}>
                  <Icon name="shield" size={20} />Moderation
                </Link>
              )}
            </div>

            <div className="drawer-spacer"></div>

            {showInstall && (
              <button className="drawer-install-btn" onClick={handleInstallClick}>
                <Icon name="download" size={18} />{canInstall ? 'Install app' : 'Add to Home Screen'}
              </button>
            )}
            <button className="drawer-logout" onClick={handleLogout}>Log out</button>
          </aside>
        </>
      )}

      {/* ---------- Mobile bottom tab bar ---------- */}
      <div className="mobile-bottom-nav" role="navigation" aria-label="Main">
        <div className="mobile-bottom-nav-inner">
          {bottomTabs.map((tab) => (
            <Link key={tab.key} to={tab.to} className={`mobile-tab ${active === tab.key ? 'active' : ''}`}>
              <span className="mobile-tab-icon">
                <Icon name={tab.icon} size={22} />
                {tab.badge > 0 && <span className="tab-badge">{tab.badge > 9 ? '9+' : tab.badge}</span>}
              </span>
              <span className="lbl">{tab.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
