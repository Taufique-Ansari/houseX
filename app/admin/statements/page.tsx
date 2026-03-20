'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, fmtDate, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Statement, Tenant, Payment } from '@/lib/types'

type Category = 'rent' | 'electricity' | 'water' | 'wifi'

function getPendingCategories(statement: Statement, allPayments: Payment[]): Category[] {
    const stmtPayments = allPayments.filter(p => p.statement_id === statement.id)
    const paidCats = new Set<Category>()
    for (const p of stmtPayments) {
        try {
            const parsed = JSON.parse(p.note || '{}')
            if (Array.isArray(parsed.categories)) {
                parsed.categories.forEach((c: string) => paidCats.add(c as Category))
            } else {
                (['rent', 'electricity', 'water', 'wifi'] as Category[]).forEach(c => paidCats.add(c))
            }
        } catch {
            (['rent', 'electricity', 'water', 'wifi'] as Category[]).forEach(c => paidCats.add(c))
        }
    }
    const allCats: { key: Category; amt: number }[] = [
        { key: 'rent', amt: Number(statement.rent_charge) },
        { key: 'electricity', amt: Number(statement.electricity_charge) },
        { key: 'water', amt: Number(statement.water_charge) },
        { key: 'wifi', amt: Number(statement.wifi_charge) },
    ]
    return allCats.filter(c => c.amt > 0 && !paidCats.has(c.key)).map(c => c.key)
}

const catIcons: Record<Category, string> = { rent: '🏠', electricity: '⚡', water: '💧', wifi: '📶' }
const catLabels: Record<Category, string> = { rent: 'Rent', electricity: 'Elec.', water: 'Water', wifi: 'WiFi' }

export default function StatementsPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loaded, setLoaded] = useState(false)
    const [allPayments, setAllPayments] = useState<Payment[]>([])
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
        const [stmtRes, tenantRes, payRes] = await Promise.all([
            fetch('/api/statements', { headers }),
            fetch('/api/tenants', { headers }),
            fetch('/api/payments', { headers }),
        ])
        const stmtData = await stmtRes.json()
        const tenantData = await tenantRes.json()
        const payData = await payRes.json()
        setStatements(Array.isArray(stmtData) ? stmtData : [])
        setTenants(Array.isArray(tenantData) ? tenantData : [])
        setAllPayments(Array.isArray(payData) ? payData : [])
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
            <div className="g2 mb4">
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
                            <th>Tenant</th><th>Month</th><th>Rent</th><th>Elec.</th><th>Water</th><th>WiFi</th><th>P. Dues</th><th>Credit</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Pending</th><th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={14} style={{ textAlign: 'center', color: '#64748b' }}>No statements found</td></tr>
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
                                        {(() => {
                                            const pending = getPendingCategories(s, allPayments)
                                            if (pending.length === 0 && Number(s.total_paid) > 0) {
                                                return <span className="green" style={{ fontSize: '0.78rem' }}>✓ None</span>
                                            }
                                            if (pending.length === 0) return <span className="muted" style={{ fontSize: '0.72rem' }}>—</span>
                                            return (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                    {pending.map(c => (
                                                        <span key={c} className="badge" style={{
                                                            background: c === 'wifi' ? '#4c1d95' : '#451a03',
                                                            color: c === 'wifi' ? '#c4b5fd' : '#fde68a',
                                                            fontSize: '0.58rem',
                                                        }}>
                                                            {catIcons[c]} {catLabels[c]}
                                                        </span>
                                                    ))}
                                                </div>
                                            )
                                        })()}
                                    </td>
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
                                <div className="row between mb2 breakdown-row"><span>🏠 Rent</span><span className="mono bold">{fmtINR(Number(detail.rent_charge))}</span></div>
                                {Number(detail.electricity_charge) > 0 && <div className="row between mb2 breakdown-row"><span>⚡ Electricity ({detail.electricity_units} kWh × ₹{Number(detail.electricity_rate).toFixed(2)})</span><span className="mono bold">{fmtINR(Number(detail.electricity_charge))}</span></div>}
                                <div className="row between mb2 breakdown-row"><span>💧 Water</span><span className="mono bold">{fmtINR(Number(detail.water_charge))}</span></div>
                                {Number(detail.wifi_charge) > 0 && <div className="row between mb2 breakdown-row"><span>📶 WiFi</span><span className="mono bold">{fmtINR(Number(detail.wifi_charge))}</span></div>}
                                {(detail.one_time_charges || []).map((c, i) => <div className="row between mb2 breakdown-row" key={i}><span>🔸 {c.description}</span><span className="mono bold">{fmtINR(Number(c.amount))}</span></div>)}
                                {Number(detail.previous_dues) > 0 && <div className="row between mb2 breakdown-row"><span className="red">⭕ Previous Dues</span><span className="mono bold red">{fmtINR(Number(detail.previous_dues))}</span></div>}
                                {Number(detail.credit_from_previous) > 0 && <div className="row between mb2 breakdown-row"><span className="green">✨ Credit Applied</span><span className="mono bold green">-{fmtINR(Number(detail.credit_from_previous))}</span></div>}
                                <div className="div" />
                                <div className="row between breakdown-row"><span className="bold">Total Due</span><span className="mono bold amber" style={{ fontSize: '1.1rem' }}>{fmtINR(Number(detail.total_due))}</span></div>
                            </div>
                        </div>

                        {/* Per-Category Payment Status */}
                        {detail.payments && detail.payments.length > 0 && (() => {
                            const paidCats = new Set<string>()
                            for (const p of detail.payments) {
                                try {
                                    const parsed = JSON.parse(p.note || '{}')
                                    if (Array.isArray(parsed.categories)) {
                                        parsed.categories.forEach((c: string) => paidCats.add(c))
                                    } else {
                                        // Legacy lump-sum payment
                                        ;['rent', 'electricity', 'water', 'wifi'].forEach(c => paidCats.add(c))
                                    }
                                } catch {
                                    ;['rent', 'electricity', 'water', 'wifi'].forEach(c => paidCats.add(c))
                                }
                            }
                            const cats = [
                                { key: 'rent', label: '🏠 Rent', amt: Number(detail.rent_charge) },
                                { key: 'electricity', label: '⚡ Electricity', amt: Number(detail.electricity_charge) },
                                { key: 'water', label: '💧 Water', amt: Number(detail.water_charge) },
                                { key: 'wifi', label: '📶 WiFi', amt: Number(detail.wifi_charge) },
                            ].filter(c => c.amt > 0)
                            const hasPending = cats.some(c => !paidCats.has(c.key))

                            return (
                                <div className="mb4">
                                    <div className="bold mb2" style={{ fontSize: '0.82rem' }}>Category Payment Status</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                        {cats.map(c => (
                                            <div key={c.key} className="row between" style={{
                                                padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem',
                                                background: paidCats.has(c.key) ? '#052e1622' : '#450a0a22',
                                                border: `1px solid ${paidCats.has(c.key) ? '#14532d66' : '#7f1d1d66'}`,
                                                flexWrap: 'wrap', gap: '0.25rem'
                                            }}>
                                                <span>{c.label}</span>
                                                <div className="row" style={{ gap: '0.375rem' }}>
                                                    <span className="mono" style={{ fontSize: '0.78rem' }}>{fmtINR(c.amt)}</span>
                                                    <span className={`badge ${paidCats.has(c.key) ? 'b-paid' : 'b-overdue'}`}>
                                                        {paidCats.has(c.key) ? '✓ Paid' : '⏳ Pending'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {hasPending && (
                                        <div className="alert a-warn mt3" style={{ fontSize: '0.75rem' }}>
                                            ⚠️ Some charges are still pending. The tenant has chosen to pay selectively.
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

                        {detail.payments && detail.payments.length > 0 && (
                            <div>
                                <div className="bold mb2" style={{ fontSize: '0.82rem' }}>Payment History</div>
                                {detail.payments.map(p => {
                                    let catInfo = ''
                                    try {
                                        const parsed = JSON.parse(p.note || '{}')
                                        if (Array.isArray(parsed.categories)) {
                                            catInfo = parsed.categories.map((c: string) => {
                                                const labels: Record<string, string> = { rent: '🏠', electricity: '⚡', water: '💧', wifi: '📶' }
                                                return labels[c] || c
                                            }).join(' ')
                                            if (parsed.userNote) catInfo += ` — ${parsed.userNote}`
                                        } else {
                                            catInfo = p.note || ''
                                        }
                                    } catch {
                                        catInfo = p.note || ''
                                    }
                                    return (
                                        <div key={p.id} className="row between mb2" style={{ fontSize: '0.8rem', flexWrap: 'wrap', gap: '0.25rem' }}>
                                            <div>
                                                <span>{fmtDate(p.paid_at)} — {p.payment_method}</span>
                                                {catInfo && <div className="small muted" style={{ fontSize: '0.7rem' }}>{catInfo}</div>}
                                            </div>
                                            <span className="mono bold green">{fmtINR(Number(p.amount))}</span>
                                        </div>
                                    )
                                })}
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
