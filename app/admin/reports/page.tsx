'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Statement } from '@/lib/types'

export default function ReportsPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [loaded, setLoaded] = useState(false)
    const [selY, setSelY] = useState(CUR_Y)
    const [view, setView] = useState<'monthly' | 'yearly'>('monthly')

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/statements', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        setStatements(Array.isArray(data) ? data : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const yearStatements = statements.filter(s => s.year === selY)

    // Monthly breakdown
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const mStmts = yearStatements.filter(s => s.month === m)
        return {
            month: m,
            expected: mStmts.reduce((s, st) => s + Number(st.total_due || 0), 0),
            collected: mStmts.reduce((s, st) => s + Number(st.total_paid || 0), 0),
            rent: mStmts.reduce((s, st) => s + Number(st.rent_charge || 0), 0),
            electricity: mStmts.reduce((s, st) => s + Number(st.electricity_charge || 0), 0),
            water: mStmts.reduce((s, st) => s + Number(st.water_charge || 0), 0),
            wifi: mStmts.reduce((s, st) => s + Number(st.wifi_charge || 0), 0),
        }
    })

    const totals = monthlyData.reduce((acc, m) => ({
        expected: acc.expected + m.expected,
        collected: acc.collected + m.collected,
        rent: acc.rent + m.rent,
        electricity: acc.electricity + m.electricity,
        water: acc.water + m.water,
        wifi: acc.wifi + m.wifi,
    }), { expected: 0, collected: 0, rent: 0, electricity: 0, water: 0, wifi: 0 })

    const collectionRate = totals.expected > 0 ? Math.round((totals.collected / totals.expected) * 100) : 0

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="row between wrap">
                    <div>
                        <div className="page-title">📈 Reports</div>
                        <div className="page-subtitle">Financial overview</div>
                    </div>
                    <div className="row" style={{ gap: '0.5rem' }}>
                        <button className={`btn ${view === 'monthly' ? 'btn-amber' : 'btn-ghost'} btn-sm`} onClick={() => setView('monthly')}>Monthly</button>
                        <button className={`btn ${view === 'yearly' ? 'btn-amber' : 'btn-ghost'} btn-sm`} onClick={() => setView('yearly')}>Yearly</button>
                        <select className="fi" value={selY} onChange={e => setSelY(+e.target.value)} style={{ width: 100 }}>
                            {[CUR_Y - 1, CUR_Y, CUR_Y + 1].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Summary */}
            <div className="g4 mb6">
                <div className="stat"><div className="stat-label">Expected</div><div className="stat-num amber">{fmtINR(totals.expected)}</div></div>
                <div className="stat"><div className="stat-label">Collected</div><div className="stat-num green">{fmtINR(totals.collected)}</div></div>
                <div className="stat"><div className="stat-label">Outstanding</div><div className="stat-num red">{fmtINR(totals.expected - totals.collected)}</div></div>
                <div className="stat"><div className="stat-label">Collection Rate</div><div className="stat-num" style={{ color: collectionRate >= 80 ? '#10b981' : '#f59e0b' }}>{collectionRate}%</div></div>
            </div>

            {/* Category breakdown */}
            <div className="g4 mb6">
                {[
                    { label: 'Rent', value: totals.rent, color: '#f59e0b' },
                    { label: 'Electricity', value: totals.electricity, color: '#3b82f6' },
                    { label: 'Water', value: totals.water, color: '#06b6d4' },
                    { label: 'WiFi', value: totals.wifi, color: '#8b5cf6' },
                ].map(c => (
                    <div className="card-inner" key={c.label} style={{ textAlign: 'center' }}>
                        <div className="muted mb2" style={{ fontSize: '0.72rem', fontWeight: 600 }}>{c.label}</div>
                        <div className="mono bold" style={{ fontSize: '1.2rem', color: c.color }}>{fmtINR(c.value)}</div>
                    </div>
                ))}
            </div>

            {/* Monthly table */}
            <div className="card">
                <div className="card-title">{selY} — Monthly Breakdown</div>
                <div className="tbl-wrap">
                    <table className="tbl">
                        <thead><tr><th>Month</th><th>Rent</th><th>Electricity</th><th>Water</th><th>WiFi</th><th>Expected</th><th>Collected</th></tr></thead>
                        <tbody>
                            {monthlyData.map(m => (
                                <tr key={m.month} style={{ opacity: m.expected > 0 ? 1 : 0.3 }}>
                                    <td className="bold">{MONTHS[m.month - 1]}</td>
                                    <td className="mono">{m.rent > 0 ? fmtINR(m.rent) : '—'}</td>
                                    <td className="mono">{m.electricity > 0 ? fmtINR(m.electricity) : '—'}</td>
                                    <td className="mono">{m.water > 0 ? fmtINR(m.water) : '—'}</td>
                                    <td className="mono">{m.wifi > 0 ? fmtINR(m.wifi) : '—'}</td>
                                    <td className="mono bold amber">{m.expected > 0 ? fmtINR(m.expected) : '—'}</td>
                                    <td className="mono bold green">{m.collected > 0 ? fmtINR(m.collected) : '—'}</td>
                                </tr>
                            ))}
                            <tr style={{ borderTop: '2px solid #f59e0b' }}>
                                <td className="bold amber">TOTAL</td>
                                <td className="mono bold">{fmtINR(totals.rent)}</td>
                                <td className="mono bold">{fmtINR(totals.electricity)}</td>
                                <td className="mono bold">{fmtINR(totals.water)}</td>
                                <td className="mono bold">{fmtINR(totals.wifi)}</td>
                                <td className="mono bold amber">{fmtINR(totals.expected)}</td>
                                <td className="mono bold green">{fmtINR(totals.collected)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
