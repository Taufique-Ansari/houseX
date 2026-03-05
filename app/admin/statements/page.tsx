'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, fmtDate, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Statement, Tenant, Payment } from '@/lib/types'

export default function StatementsPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loaded, setLoaded] = useState(false)
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)
    const [selM, setSelM] = useState(CUR_M)
    const [selY, setSelY] = useState(CUR_Y)
    const [selTenant, setSelTenant] = useState('')
    const [selStatus, setSelStatus] = useState('')

    // Detail modal
    const [detail, setDetail] = useState<(Statement & { payments?: Payment[] }) | null>(null)
    // Add charge modal
    const [addCharge, setAddCharge] = useState<string | null>(null)
    const [chargeDesc, setChargeDesc] = useState('')
    const [chargeAmt, setChargeAmt] = useState('')

    // Delete modal
    const [delConfirm, setDelConfirm] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)

    const getHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return { Authorization: `Bearer ${session?.access_token}` }
    }

    const loadData = useCallback(async () => {
        const headers = await getHeaders()
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

    const filtered = statements.filter(s => {
        if (selM && s.month !== selM) return false
        if (selY && s.year !== selY) return false
        if (selTenant && s.tenant_id !== selTenant) return false
        if (selStatus && s.status !== selStatus) return false
        return true
    })

    const generateAll = async () => {
        setLoading(true); setMsg(null)
        try {
            const headers = { ...(await getHeaders()), 'Content-Type': 'application/json' }
            const res = await fetch('/api/statements/generate-all', {
                method: 'POST', headers,
                body: JSON.stringify({ month: selM, year: selY }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            const successes = data.results?.filter((r: { success: boolean }) => r.success).length || 0
            const failures = data.results?.filter((r: { success: boolean }) => !r.success).length || 0
            setMsg({ type: 'ok', text: `Generated ${successes} statements. ${failures > 0 ? `${failures} failed.` : ''}` })
            await loadData()
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setLoading(false)
            setTimeout(() => setMsg(null), 5000)
        }
    }

    const publish = async (id: string) => {
        try {
            const headers = await getHeaders()
            const res = await fetch(`/api/statements/${id}/publish`, { method: 'PATCH', headers })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
            await loadData()
            setMsg({ type: 'ok', text: 'Statement published ✓' })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        }
        setTimeout(() => setMsg(null), 4000)
    }

    const viewDetail = async (id: string) => {
        const headers = await getHeaders()
        const res = await fetch(`/api/statements/${id}`, { headers })
        const data = await res.json()
        setDetail(data)
    }

    const submitCharge = async () => {
        if (!addCharge || !chargeDesc || !chargeAmt) return
        try {
            const headers = { ...(await getHeaders()), 'Content-Type': 'application/json' }
            const res = await fetch(`/api/statements/${addCharge}/add-charge`, {
                method: 'POST', headers,
                body: JSON.stringify({ description: chargeDesc, amount: Number(chargeAmt) }),
            })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
            setAddCharge(null); setChargeDesc(''); setChargeAmt('')
            await loadData()
            setMsg({ type: 'ok', text: 'Charge added ✓' })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        }
        setTimeout(() => setMsg(null), 4000)
    }

    const handleDelete = async () => {
        if (!delConfirm) return
        setDeleting(true)
        try {
            const headers = await getHeaders()
            const res = await fetch(`/api/statements/${delConfirm}`, { method: 'DELETE', headers })
            if (!res.ok) throw new Error((await res.json()).error)
            await loadData()
            setDelConfirm(null)
            setMsg({ type: 'ok', text: 'Draft statement deleted ✓' })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to delete' })
        } finally {
            setDeleting(false)
            setTimeout(() => setMsg(null), 4000)
        }
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="row between wrap">
                    <div>
                        <div className="page-title">🧾 Statements</div>
                        <div className="page-subtitle">Generate, publish, and manage monthly statements</div>
                    </div>
                    <button className="btn btn-amber" onClick={generateAll} disabled={loading}>
                        {loading ? <><Spinner /> Generating...</> : `⚡ Generate All for ${fmtM(selM, selY)}`}
                    </button>
                </div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            {/* Filters */}
            <div className="g4 mb4">
                <select className="fi" value={selM} onChange={e => setSelM(+e.target.value)}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select className="fi" value={selY} onChange={e => setSelY(+e.target.value)}>
                    {[CUR_Y - 1, CUR_Y, CUR_Y + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="fi" value={selTenant} onChange={e => setSelTenant(e.target.value)}>
                    <option value="">All Tenants</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.profiles?.name} ({t.flat})</option>)}
                </select>
                <select className="fi" value={selStatus} onChange={e => setSelStatus(e.target.value)}>
                    <option value="">All Status</option>
                    {['draft', 'published', 'partial', 'paid', 'overdue'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="card">
                <div className="tbl-wrap">
                    <table className="tbl">
                        <thead><tr>
                            <th>Tenant</th><th>Month</th><th>Rent</th><th>Elec.</th><th>Water</th><th>WiFi</th><th>P. Dues</th><th>Credit</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={13} style={{ textAlign: 'center', color: '#64748b' }}>No statements found</td></tr>
                            ) : filtered.map(s => (
                                <tr key={s.id}>
                                    <td className="bold">{s.tenants?.profiles?.name || '—'}<br /><span className="small muted">{s.tenants?.flat}</span></td>
                                    <td>{fmtM(s.month, s.year)}</td>
                                    <td className="mono">{fmtINR(Number(s.rent_charge))}</td>
                                    <td className="mono">{fmtINR(Number(s.electricity_charge))}</td>
                                    <td className="mono">{fmtINR(Number(s.water_charge))}</td>
                                    <td className="mono">{fmtINR(Number(s.wifi_charge))}</td>
                                    <td className="mono amber">{Number(s.previous_dues) > 0 ? fmtINR(Number(s.previous_dues)) : '—'}</td>
                                    <td className="mono green">{Number(s.credit_from_previous) > 0 ? `-${fmtINR(Number(s.credit_from_previous))}` : '—'}</td>
                                    <td className="mono bold amber">{fmtINR(Number(s.total_due))}</td>
                                    <td className="mono bold green">{fmtINR(Number(s.total_paid))}</td>
                                    <td className="mono bold" style={{ color: Number(s.balance) > 0 ? '#ef4444' : '#10b981' }}>{fmtINR(Number(s.balance))}</td>
                                    <td><span className={`badge b-${s.status}`}>{s.status.toUpperCase()}</span></td>
                                    <td>
                                        <div className="row" style={{ gap: '0.25rem' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => viewDetail(s.id)}>👁</button>
                                            {s.status === 'draft' && <button className="btn btn-blue btn-sm" onClick={() => publish(s.id)}>Publish</button>}
                                            <button className="btn btn-ghost btn-sm" onClick={() => setAddCharge(s.id)}>+₹</button>
                                            {s.status === 'draft' && <button className="btn btn-red btn-sm" onClick={() => setDelConfirm(s.id)}>🗑</button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {detail && (
                <div className="overlay" onClick={() => setDetail(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>Statement — {detail.tenants?.profiles?.name} ({detail.tenants?.flat})</h2>
                            <button className="close-btn" onClick={() => setDetail(null)}>×</button>
                        </div>
                        <div className="mb4">
                            <div className="mono bold amber mb1" style={{ fontSize: '0.75rem' }}>{fmtM(detail.month, detail.year)} {detail.is_prorated ? '(Prorated)' : ''}</div>
                            <div className="card-inner" style={{ fontSize: '0.82rem' }}>
                                <div className="row between mb2"><span>🏠 Rent</span><span className="mono bold">{fmtINR(Number(detail.rent_charge))}</span></div>
                                {Number(detail.electricity_charge) > 0 && <div className="row between mb2"><span>⚡ Electricity ({detail.electricity_units} kWh × ₹{Number(detail.electricity_rate).toFixed(2)})</span><span className="mono bold">{fmtINR(Number(detail.electricity_charge))}</span></div>}
                                <div className="row between mb2"><span>💧 Water</span><span className="mono bold">{fmtINR(Number(detail.water_charge))}</span></div>
                                {Number(detail.wifi_charge) > 0 && <div className="row between mb2"><span>📶 WiFi</span><span className="mono bold">{fmtINR(Number(detail.wifi_charge))}</span></div>}
                                {(detail.one_time_charges || []).map((c, i) => <div className="row between mb2" key={i}><span>🔸 {c.description}</span><span className="mono bold">{fmtINR(Number(c.amount))}</span></div>)}
                                {Number(detail.previous_dues) > 0 && <div className="row between mb2"><span className="red">⭕ Previous Dues</span><span className="mono bold red">{fmtINR(Number(detail.previous_dues))}</span></div>}
                                {Number(detail.credit_from_previous) > 0 && <div className="row between mb2"><span className="green">✨ Credit Applied</span><span className="mono bold green">-{fmtINR(Number(detail.credit_from_previous))}</span></div>}
                                <div className="div" />
                                <div className="row between"><span className="bold">Total Due</span><span className="mono bold amber" style={{ fontSize: '1.1rem' }}>{fmtINR(Number(detail.total_due))}</span></div>
                            </div>
                        </div>
                        {detail.payments && detail.payments.length > 0 && (
                            <div>
                                <div className="bold mb2" style={{ fontSize: '0.82rem' }}>Payments</div>
                                {detail.payments.map(p => (
                                    <div key={p.id} className="row between mb2" style={{ fontSize: '0.8rem' }}>
                                        <span>{fmtDate(p.paid_at)} — {p.payment_method}</span>
                                        <span className="mono bold green">{fmtINR(Number(p.amount))}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Charge Modal */}
            {addCharge && (
                <div className="overlay" onClick={() => setAddCharge(null)}>
                    <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>Add One-Time Charge</h2>
                            <button className="close-btn" onClick={() => setAddCharge(null)}>×</button>
                        </div>
                        <div className="fg">
                            <label className="fl">Description</label>
                            <input className="fi" value={chargeDesc} onChange={e => setChargeDesc(e.target.value)} placeholder="e.g. Maintenance repair" />
                        </div>
                        <div className="fg">
                            <label className="fl">Amount (₹)</label>
                            <input className="fi" type="number" value={chargeAmt} onChange={e => setChargeAmt(e.target.value)} placeholder="e.g. 500" />
                        </div>
                        <button className="btn btn-amber btn-full" onClick={submitCharge}>Add Charge</button>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {delConfirm && (
                <div className="overlay" onClick={() => !deleting && setDelConfirm(null)}>
                    <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>Delete Draft Statement</h2>
                            <button className="close-btn" onClick={() => !deleting && setDelConfirm(null)} disabled={deleting}>×</button>
                        </div>
                        <div className="mb4" style={{ lineHeight: 1.5 }}>
                            Are you sure you want to delete this statement? This will also remove any manual charges associated with it. This action cannot be undone.
                        </div>
                        <div className="row" style={{ gap: '1rem' }}>
                            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDelConfirm(null)} disabled={deleting}>Cancel</button>
                            <button className="btn btn-red" style={{ flex: 1 }} onClick={handleDelete} disabled={deleting}>
                                {deleting ? <><Spinner /> Deleting...</> : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
