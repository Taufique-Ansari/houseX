'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
    { href: '/tenant/statement', icon: '🧾', label: 'Statement' },
    { href: '/tenant/history', icon: '📚', label: 'History' },
    { href: '/tenant/reading', icon: '📟', label: 'Reading' },
    { href: '/tenant/profile', icon: '👤', label: 'Profile' },
]

export default function TenantLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const [flat, setFlat] = useState('')
    const [userName, setUserName] = useState('')

    useEffect(() => {
        const check = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) { router.push('/login'); return }
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const res = await fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${session.access_token}` } })
            const profile = await res.json()
            if (profile?.role === 'admin') { router.push('/admin/overview'); return }
            setUserName(profile.name || 'Tenant')
            // Fetch tenant flat
            const tenantRes = await fetch(`/api/tenants/${user.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
            const tenantData = await tenantRes.json()
            if (tenantData?.flat) setFlat(tenantData.flat)
        }
        check()
    }, [router])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="tenant-shell">
            {/* Top bar */}
            <div className="tenant-topbar">
                <div className="tenant-topbar-brand">
                    <div className="tenant-topbar-icon">⚡</div>
                    <div>
                        <div className="tenant-topbar-title">HX</div>
                        <div className="tenant-topbar-flat">{flat || userName}</div>
                    </div>
                </div>
                <div className="row" style={{ gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{userName}</span>
                    <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ fontSize: '0.68rem' }}>Logout</button>
                </div>
            </div>

            {/* Page content */}
            {children}

            {/* Bottom nav */}
            <nav className="bottom-nav">
                {NAV_ITEMS.map(item => (
                    <a
                        key={item.href}
                        className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
                        onClick={() => router.push(item.href)}
                    >
                        <span className="bottom-nav-icon">{item.icon}</span>
                        <span className="bottom-nav-label">{item.label}</span>
                    </a>
                ))}
            </nav>
        </div>
    )
}
