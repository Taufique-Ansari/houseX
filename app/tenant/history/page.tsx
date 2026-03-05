'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, PAYMENT_METHODS } from '@/lib/utils'
import type { Statement } from '@/lib/types'

export default function TenantHistoryPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [loaded, setLoaded] = useState(false)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Pay modal
    const [payStmt, setPayStmt] = useState<Statement | null>(null)
    const [payAmount, setPayAmount] = useState('')
    const [payMethod, setPayMethod] = useState('upi')
    const [payProof, setPayProof] = useState<File | null>(null)
    const [paying, setPaying] = useState(false)

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/statements', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        setStatements(Array.isArray(data) ? data.sort((a: Statement, b: Statement) => (b.year * 12 + b.month) - (a.year * 12 + a.month)) : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

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
            await loadData()
            setMsg({ type: 'ok', text: 'Payment submitted ✓' })
        } catch (err: unknown) { setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' }) }
        finally { setPaying(false); setTimeout(() => setMsg(null), 4000) }
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
            ) : statements.map(s => (
                <div className="card mb3" key={s.id} style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    <div className="row between">
                        <div className="row">
                            <div className="bold" style={{ fontSize: '0.92rem' }}>{fmtM(s.month, s.year)}</div>
                            <span className={`badge b-${s.status}`}>{s.status.toUpperCase()}</span>
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
                                <div className="row between mb2"><span>🏠 Rent</span><span className="mono">{fmtINR(Number(s.rent_charge))}</span></div>
                                {Number(s.electricity_charge) > 0 && <div className="row between mb2"><span>⚡ Electricity ({s.electricity_units} kWh)</span><span className="mono">{fmtINR(Number(s.electricity_charge))}</span></div>}
                                <div className="row between mb2"><span>💧 Water</span><span className="mono">{fmtINR(Number(s.water_charge))}</span></div>
                                {Number(s.wifi_charge) > 0 && <div className="row between mb2"><span>📶 WiFi</span><span className="mono">{fmtINR(Number(s.wifi_charge))}</span></div>}
                                {Number(s.credit_from_previous) > 0 && <div className="row between mb2"><span className="green">Credit</span><span className="mono green">-{fmtINR(Number(s.credit_from_previous))}</span></div>}
                            </div>
                            {Number(s.balance) > 0 && ['published', 'partial', 'overdue'].includes(s.status) && (
                                <button className="btn btn-amber btn-full mt3" onClick={() => { setPayStmt(s); setPayAmount(String(Number(s.balance))); setPayMethod('upi') }}>
                                    💳 Pay {fmtINR(Number(s.balance))}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {payStmt && (
                <div className="overlay" onClick={() => setPayStmt(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd"><h2>Pay — {fmtM(payStmt.month, payStmt.year)}</h2><button className="close-btn" onClick={() => setPayStmt(null)}>×</button></div>
                        <div className="fg"><label className="fl">Amount (₹)</label><input className="fi" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} /></div>
                        <div className="fg"><label className="fl">Method</label><select className="fi" value={payMethod} onChange={e => setPayMethod(e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                        <div className="fg"><label className="fl">Proof</label><input type="file" accept="image/*" className="fi" onChange={e => setPayProof(e.target.files?.[0] || null)} /></div>
                        <button className="btn btn-amber btn-full" onClick={submitPay} disabled={paying}>{paying ? 'Submitting...' : `✓ Pay ${fmtINR(Number(payAmount || 0))}`}</button>
                    </div>
                </div>
            )}
        </div>
    )
}
