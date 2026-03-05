'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
    { href: '/admin/overview', icon: '📊', label: 'Overview' },
    { href: '/admin/statements', icon: '🧾', label: 'Statements' },
    { href: '/admin/utilities', icon: '⚡', label: 'Utilities' },
    { href: '/admin/readings', icon: '📟', label: 'Readings' },
    { href: '/admin/payments', icon: '💳', label: 'Payments' },
    { href: '/admin/tenants', icon: '👥', label: 'Tenants' },
    { href: '/admin/reports', icon: '📈', label: 'Reports' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [userName, setUserName] = useState('')

    useEffect(() => {
        const check = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) { router.push('/login'); return }
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const res = await fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${session.access_token}` } })
            const profile = await res.json()
            if (profile?.role !== 'admin') { router.push('/tenant/statement'); return }
            setUserName(profile.name || 'Admin')
        }
        check()
    }, [router])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="admin-shell">
            {/* Mobile toggle */}
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            {sidebarOpen && <div className={`sidebar-overlay show`} onClick={() => setSidebarOpen(false)} />}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-brand">
                    <div className="sidebar-icon">⚡</div>
                    <div>
                        <div className="sidebar-title">HX</div>
                        <div className="sidebar-subtitle">ADMIN PANEL</div>
                    </div>
                </div>
                <nav className="sidebar-nav">
                    {NAV_ITEMS.map(item => (
                        <a
                            key={item.href}
                            className={`sidebar-link ${pathname.startsWith(item.href) ? 'active' : ''}`}
                            onClick={() => { router.push(item.href); setSidebarOpen(false) }}
                        >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                        </a>
                    ))}
                </nav>
                <div className="sidebar-user">
                    <div className="sidebar-user-info">
                        <div className="sidebar-avatar">{userName.charAt(0).toUpperCase()}</div>
                        <div>
                            <div className="sidebar-user-name">{userName}</div>
                            <div className="sidebar-user-role">Administrator</div>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ fontSize: '0.7rem' }}>Logout</button>
                </div>
            </aside>

            {/* Main content */}
            <main className="admin-main">
                {children}
            </main>
        </div>
    )
}
