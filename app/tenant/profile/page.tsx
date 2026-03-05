'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtDate } from '@/lib/utils'
import type { Tenant } from '@/lib/types'

export default function TenantProfilePage() {
    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [loaded, setLoaded] = useState(false)

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const res = await fetch(`/api/tenants/${user.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        if (!data.error) setTenant(data)
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>
    if (!tenant) return <div className="page"><div className="alert a-err">Profile not found</div></div>

    const fields = [
        { icon: '🏠', label: 'Flat', value: tenant.flat },
        { icon: '💰', label: 'Monthly Rent', value: fmtINR(Number(tenant.rent_amount)) },
        { icon: '📅', label: 'Due Day', value: `${tenant.rent_due_day}th of every month` },
        { icon: '📶', label: 'WiFi', value: tenant.wifi_opted_in ? '✓ Opted In' : '✗ Not Opted' },
        { icon: '📆', label: 'Move-in Date', value: tenant.move_in_date ? fmtDate(tenant.move_in_date) : '—' },
        { icon: '📋', label: 'Lease Start', value: tenant.lease_start_date ? fmtDate(tenant.lease_start_date) : '—' },
        { icon: '📋', label: 'Lease End', value: tenant.lease_end_date ? fmtDate(tenant.lease_end_date) : '—' },
        { icon: '🔒', label: 'Security Deposit', value: fmtINR(Number(tenant.security_deposit_amount || 0)) },
    ]

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">👤 My Profile</div>
            </div>

            <div className="card mb4" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
                <div style={{
                    width: 64, height: 64, borderRadius: '50%', margin: '0 auto 1rem',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.6rem', fontWeight: 700, color: '#0f172a',
                }}>{tenant.profiles?.name?.charAt(0) || '?'}</div>
                <div className="bold" style={{ fontSize: '1.15rem', color: '#f8fafc' }}>{tenant.profiles?.name}</div>
                <div className="small muted">{tenant.profiles?.email}</div>
                {tenant.profiles?.phone && <div className="small muted">{tenant.profiles.phone}</div>}
            </div>

            <div className="card">
                <div className="card-title">Details</div>
                {fields.map(f => (
                    <div className="row between mb3" key={f.label} style={{ fontSize: '0.88rem' }}>
                        <span className="muted">{f.icon} {f.label}</span>
                        <span className="bold">{f.value}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
