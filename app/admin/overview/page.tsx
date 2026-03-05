'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, CUR_M, CUR_Y } from '@/lib/utils'
import type { Statement, Tenant } from '@/lib/types'

export default function OverviewPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loaded, setLoaded] = useState(false)

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const headers = { Authorization: `Bearer ${session.access_token}` }
        const [stmtRes, tenantRes] = await Promise.all([
            fetch('/api/statements', { headers }),
            fetch('/api/tenants', { headers }),
        ])
        const stmtData = await stmtRes.json()
        const tenantData = await tenantRes.json()
        setStatements(Array.isArray(stmtData) ? stmtData : [])
        setTenants(Array.isArray(tenantData) ? tenantData : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const curStatements = statements.filter(s => s.month === CUR_M && s.year === CUR_Y)
    const expected = curStatements.reduce((s, st) => s + Number(st.total_due || 0), 0)
    const collected = curStatements.reduce((s, st) => s + Number(st.total_paid || 0), 0)
    const outstanding = statements.filter(s => Number(s.balance) > 0).reduce((s, st) => s + Number(st.balance), 0)
    const overdueCount = statements.filter(s => s.status === 'overdue').length

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">📊 Dashboard</div>
                <div className="page-subtitle">{fmtM(CUR_M, CUR_Y)} Overview</div>
            </div>

            <div className="g4 mb6">
                {[
                    { label: 'Expected This Month', value: fmtINR(expected), color: '#f59e0b' },
                    { label: 'Collected', value: fmtINR(collected), color: '#10b981' },
                    { label: 'Outstanding', value: fmtINR(outstanding), color: '#ef4444' },
                    { label: 'Overdue', value: String(overdueCount), color: '#f59e0b' },
                ].map(s => (
                    <div className="stat" key={s.label}>
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-num" style={{ color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            <div className="card-title">Tenant Summary</div>
            <div className="g2">
                {tenants.filter(t => t.is_active).map(t => {
                    const stmt = curStatements.find(s => s.tenant_id === t.id)
                    return (
                        <div className="tenant-card" key={t.id}>
                            <div className="row between mb3">
                                <div className="row">
                                    <div style={{
                                        width: 38, height: 38, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.95rem', fontWeight: 700, color: '#0f172a',
                                    }}>{t.profiles?.name?.charAt(0) || '?'}</div>
                                    <div>
                                        <div className="bold" style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{t.profiles?.name}</div>
                                        <div className="small muted">{t.flat}</div>
                                    </div>
                                </div>
                                {stmt && (
                                    <span className={`badge b-${stmt.status}`}>{stmt.status.toUpperCase()}</span>
                                )}
                            </div>
                            {stmt ? (
                                <div className="g3" style={{ fontSize: '0.78rem' }}>
                                    <div><div className="muted mb1">Due</div><div className="mono bold amber">{fmtINR(Number(stmt.total_due))}</div></div>
                                    <div><div className="muted mb1">Paid</div><div className="mono bold green">{fmtINR(Number(stmt.total_paid))}</div></div>
                                    <div><div className="muted mb1">Balance</div><div className="mono bold" style={{ color: Number(stmt.balance) > 0 ? '#ef4444' : '#10b981' }}>{fmtINR(Number(stmt.balance))}</div></div>
                                </div>
                            ) : (
                                <div className="small muted">No statement for {fmtM(CUR_M, CUR_Y)}</div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
