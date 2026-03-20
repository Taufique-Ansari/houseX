'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, PAYMENT_METHODS } from '@/lib/utils'
import type { Statement, Payment } from '@/lib/types'

type Category = 'rent' | 'electricity' | 'water' | 'wifi'

function getCategoriesPaidByPayments(payments: Payment[]): Set<Category> {
    const paid = new Set<Category>()
    for (const p of payments) {
        try {
            const parsed = JSON.parse(p.note || '{}')
            if (Array.isArray(parsed.categories)) {
                parsed.categories.forEach((c: string) => paid.add(c as Category))
            } else {
                paid.add('rent'); paid.add('electricity'); paid.add('water'); paid.add('wifi')
            }
        } catch {
            paid.add('rent'); paid.add('electricity'); paid.add('water'); paid.add('wifi')
        }
    }
    return paid
}

function categoryAmount(s: Statement, cat: Category): number {
    switch (cat) {
        case 'rent': return Number(s.rent_charge)
        case 'electricity': return Number(s.electricity_charge)
        case 'water': return Number(s.water_charge)
        case 'wifi': return Number(s.wifi_charge)
    }
}

export default function TenantHistoryPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [loaded, setLoaded] = useState(false)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Details cache (statement id → payments)
    const [details, setDetails] = useState<Record<string, Payment[]>>({})

    // Pay modal
    const [payStmt, setPayStmt] = useState<Statement | null>(null)
    const [payAmount, setPayAmount] = useState('')
    const [payMethod, setPayMethod] = useState('upi')
    const [payProof, setPayProof] = useState<File | null>(null)
    const [paying, setPaying] = useState(false)

    // WiFi pay modal
    const [wifiPayStmt, setWifiPayStmt] = useState<Statement | null>(null)
    const [wifiPayMethod, setWifiPayMethod] = useState('upi')
    const [wifiPayProof, setWifiPayProof] = useState<File | null>(null)
    const [wifiPaying, setWifiPaying] = useState(false)

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/statements', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        setStatements(Array.isArray(data) ? data.sort((a: Statement, b: Statement) => (b.year * 12 + b.month) - (a.year * 12 + a.month)) : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    // Load detail (payments) when a statement is expanded
    const loadDetail = async (id: string) => {
        if (details[id]) return // already loaded
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch(`/api/statements/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        setDetails(prev => ({ ...prev, [id]: data.payments || [] }))
    }

    const toggleExpand = (id: string) => {
        if (expanded === id) {
            setExpanded(null)
        } else {
            setExpanded(id)
            loadDetail(id)
        }
    }

    const submitPay = async () => {
        if (!payStmt || !payAmount) return
        setPaying(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const formData = new FormData()
            formData.append('statement_id', payStmt.id)
            formData.append('amount', payAmount)
            formData.append('payment_method', payMethod)
            if (payProof) formData.append('proof_image', payProof)
            const res = await fetch('/api/payments', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData })
            if (!res.ok) throw new Error((await res.json()).error)
            setPayStmt(null)
            // Clear detail cache for this statement so it reloads
            setDetails(prev => { const n = { ...prev }; delete n[payStmt.id]; return n })
            await loadData()
            setMsg({ type: 'ok', text: 'Payment submitted ✓' })
        } catch (err: unknown) { setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' }) }
        finally { setPaying(false); setTimeout(() => setMsg(null), 4000) }
    }

    // WiFi payment
    const submitWifiPay = async () => {
        if (!wifiPayStmt) return
        setWifiPaying(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const wifiAmt = categoryAmount(wifiPayStmt, 'wifi')
            const formData = new FormData()
            formData.append('statement_id', wifiPayStmt.id)
            formData.append('amount', String(wifiAmt))
            formData.append('payment_method', wifiPayMethod)
            formData.append('note', JSON.stringify({ categories: ['wifi'] }))
            if (wifiPayProof) formData.append('proof_image', wifiPayProof)
            const res = await fetch('/api/payments', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData })
            if (!res.ok) throw new Error((await res.json()).error)
            setWifiPayStmt(null)
            setDetails(prev => { const n = { ...prev }; delete n[wifiPayStmt.id]; return n })
            await loadData()
            setMsg({ type: 'ok', text: `WiFi payment of ${fmtINR(wifiAmt)} submitted ✓` })
        } catch (err: unknown) { setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' }) }
        finally { setWifiPaying(false); setTimeout(() => setMsg(null), 4000) }
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">📚 Statement History</div>
                <div className="page-subtitle">{statements.length} statements</div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            {statements.length === 0 ? (
                <div className="empty"><div className="empty-icon">📭</div><div>No statements yet</div></div>
            ) : statements.map(s => {
                const payments = details[s.id]
                const paidCats = payments ? getCategoriesPaidByPayments(payments) : null
                const wifiAmt = categoryAmount(s, 'wifi')
                const wifiPending = paidCats && wifiAmt > 0 && !paidCats.has('wifi')

                // Determine display status: if core is paid, show as paid
                const coreCats: Category[] = ['rent', 'electricity', 'water']
                const coreAllPaid = paidCats
                    ? coreCats.filter(c => categoryAmount(s, c) > 0).every(c => paidCats.has(c))
                    : false
                const showStatus = coreAllPaid ? 'paid' : s.status

                return (
                    <div className="card mb3" key={s.id} style={{ cursor: 'pointer' }} onClick={() => toggleExpand(s.id)}>
                        <div className="row between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div className="row" style={{ gap: '0.5rem' }}>
                                <div className="bold" style={{ fontSize: '0.92rem' }}>{fmtM(s.month, s.year)}</div>
                                <span className={`badge b-${showStatus}`}>{showStatus.toUpperCase()}</span>
                                {wifiPending && (
                                    <span className="badge" style={{ background: '#4c1d95', color: '#c4b5fd', fontSize: '0.62rem' }}>
                                        📶 WiFi Pending
                                    </span>
                                )}
                            </div>
                            <div className="row" style={{ gap: '1rem' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="mono bold amber">{fmtINR(Number(s.total_due))}</div>
                                    <div className="small muted">Due</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="mono bold green">{fmtINR(Number(s.total_paid))}</div>
                                    <div className="small muted">Paid</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className={`mono bold ${Number(s.balance) > 0 ? 'red' : 'green'}`}>{fmtINR(Number(s.balance))}</div>
                                    <div className="small muted">Balance</div>
                                </div>
                            </div>
                        </div>

                        {expanded === s.id && (
                            <div className="mt3" onClick={e => e.stopPropagation()}>
                                <div className="card-inner" style={{ fontSize: '0.82rem' }}>
                                    <div className="row between mb2">
                                        <span>🏠 Rent</span>
                                        <div className="row" style={{ gap: '0.5rem' }}>
                                            <span className="mono">{fmtINR(Number(s.rent_charge))}</span>
                                            {paidCats && <span className={`badge ${paidCats.has('rent') ? 'b-paid' : 'b-overdue'}`} style={{ fontSize: '0.58rem' }}>{paidCats.has('rent') ? '✓' : '⏳'}</span>}
                                        </div>
                                    </div>
                                    {Number(s.electricity_charge) > 0 && (
                                        <div className="row between mb2">
                                            <span>⚡ Electricity ({s.electricity_units} kWh)</span>
                                            <div className="row" style={{ gap: '0.5rem' }}>
                                                <span className="mono">{fmtINR(Number(s.electricity_charge))}</span>
                                                {paidCats && <span className={`badge ${paidCats.has('electricity') ? 'b-paid' : 'b-overdue'}`} style={{ fontSize: '0.58rem' }}>{paidCats.has('electricity') ? '✓' : '⏳'}</span>}
                                            </div>
                                        </div>
                                    )}
                                    <div className="row between mb2">
                                        <span>💧 Water</span>
                                        <div className="row" style={{ gap: '0.5rem' }}>
                                            <span className="mono">{fmtINR(Number(s.water_charge))}</span>
                                            {paidCats && <span className={`badge ${paidCats.has('water') ? 'b-paid' : 'b-overdue'}`} style={{ fontSize: '0.58rem' }}>{paidCats.has('water') ? '✓' : '⏳'}</span>}
                                        </div>
                                    </div>
                                    {Number(s.credit_from_previous) > 0 && (
                                        <div className="row between mb2"><span className="green">Credit</span><span className="mono green">-{fmtINR(Number(s.credit_from_previous))}</span></div>
                                    )}
                                </div>

                                {/* WiFi section in expanded view */}
                                {wifiAmt > 0 && (
                                    <div className="card-inner mt2" style={{ borderColor: paidCats?.has('wifi') ? '#052e1644' : '#4c1d9544' }}>
                                        <div className="row between" style={{ fontSize: '0.82rem' }}>
                                            <span>📶 WiFi</span>
                                            <div className="row" style={{ gap: '0.5rem' }}>
                                                <span className="mono">{fmtINR(wifiAmt)}</span>
                                                {paidCats && (
                                                    <span className={`badge ${paidCats.has('wifi') ? 'b-paid' : ''}`} style={paidCats.has('wifi') ? {} : { background: '#4c1d95', color: '#c4b5fd', fontSize: '0.58rem' }}>
                                                        {paidCats.has('wifi') ? '✓ Paid' : '⏳ Pending'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {paidCats && !paidCats.has('wifi') && ['published', 'partial', 'paid', 'overdue'].includes(s.status) && (
                                            <button
                                                className="btn btn-full btn-sm mt2"
                                                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: '0.78rem' }}
                                                onClick={() => { setWifiPayStmt(s); setWifiPayMethod('upi'); setWifiPayProof(null) }}
                                            >
                                                📶 Pay WiFi — {fmtINR(wifiAmt)}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Main pay button for remaining non-wifi balance */}
                                {!coreAllPaid && Number(s.balance) > 0 && ['published', 'partial', 'overdue'].includes(s.status) && (
                                    <button className="btn btn-amber btn-full mt3" onClick={() => { setPayStmt(s); setPayAmount(String(Number(s.balance))); setPayMethod('upi') }}>
                                        💳 Pay {fmtINR(Number(s.balance))}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Main Pay Modal */}
            {payStmt && (
                <div className="overlay" onClick={() => setPayStmt(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd"><h2>Pay — {fmtM(payStmt.month, payStmt.year)}</h2><button className="close-btn" onClick={() => setPayStmt(null)}>×</button></div>
                        <div className="fg"><label className="fl">Amount (₹)</label><input className="fi" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} /></div>
                        <div className="fg"><label className="fl">Method</label><select className="fi" value={payMethod} onChange={e => setPayMethod(e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                        <div className="fg"><label className="fl">📸 Proof</label><input type="file" accept="image/*" className="fi" onChange={e => setPayProof(e.target.files?.[0] || null)} /></div>
                        <button className="btn btn-amber btn-full" onClick={submitPay} disabled={paying}>{paying ? 'Submitting...' : `✓ Pay ${fmtINR(Number(payAmount || 0))}`}</button>
                    </div>
                </div>
            )}

            {/* WiFi Pay Modal */}
            {wifiPayStmt && (
                <div className="overlay" onClick={() => setWifiPayStmt(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>📶 Pay WiFi</h2>
                            <button className="close-btn" onClick={() => setWifiPayStmt(null)}>×</button>
                        </div>
                        <div className="card-inner mb4" style={{ textAlign: 'center' }}>
                            <div className="small muted mb2">WiFi Charge for {fmtM(wifiPayStmt.month, wifiPayStmt.year)}</div>
                            <div className="mono bold" style={{ fontSize: '1.75rem', color: '#8b5cf6' }}>
                                {fmtINR(categoryAmount(wifiPayStmt, 'wifi'))}
                            </div>
                        </div>
                        <div className="fg">
                            <label className="fl">Payment Method</label>
                            <select className="fi" value={wifiPayMethod} onChange={e => setWifiPayMethod(e.target.value)}>
                                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        <div className="fg">
                            <label className="fl">📸 Proof Screenshot</label>
                            <input type="file" accept="image/*" className="fi" onChange={e => setWifiPayProof(e.target.files?.[0] || null)} />
                        </div>
                        <button
                            className="btn btn-full"
                            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
                            onClick={submitWifiPay}
                            disabled={wifiPaying}
                        >
                            {wifiPaying ? 'Submitting...' : `✓ Pay WiFi — ${fmtINR(categoryAmount(wifiPayStmt, 'wifi'))}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
