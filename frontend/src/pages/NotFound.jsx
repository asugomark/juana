import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      textAlign: 'center',
      padding: '20px',
      background: 'var(--surface, #12141c)',
      color: 'var(--paper, #fff)'
    }}>
      <h1 style={{ fontSize: '72px', marginBottom: '16px' }}>404</h1>
      <h2 style={{ marginBottom: '12px' }}>Page Not Found</h2>
      <p style={{ color: 'var(--slate, #8a8d9b)', marginBottom: '24px' }}>
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/dashboard"
        style={{
          padding: '12px 24px',
          background: 'var(--lime, #c2f970)',
          color: 'var(--ink, #000)',
          borderRadius: '100px',
          fontWeight: 700,
          textDecoration: 'none'
        }}
      >
        Back to Dashboard
      </Link>
    </div>
  )
}