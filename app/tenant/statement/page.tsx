'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, fmtDate, PAYMENT_METHODS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Statement, Payment } from '@/lib/types'

export default function TenantStatementPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [loaded, setLoaded] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Pay modal
    const [payStmt, setPayStmt] = useState<Statement | null>(null)
    const [payAmount, setPayAmount] = useState('')
    const [payMethod, setPayMethod] = useState('upi')
    const [payNote, setPayNote] = useState('')
    const [payProof, setPayProof] = useState<File | null>(null)
    const [paying, setPaying] = useState(false)

    // Detail modal
    const [detail, setDetail] = useState<(Statement & { payments?: Payment[] }) | null>(null)

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/statements', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        setStatements(Array.isArray(data) ? data : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const current = statements.find(s => s.month === CUR_M && s.year === CUR_Y)

    const openPay = (s: Statement) => {
        setPayStmt(s)
        setPayAmount(String(Number(s.balance)))
        setPayMethod('upi')
        setPayNote('')
        setPayProof(null)
    }

    const submitPay = async () => {
        if (!payStmt || !payAmount) return
        setPaying(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const formData = new FormData()
            formData.append('statement_id', payStmt.id)
            formData.append('amount', payAmount)
            formData.append('payment_method', payMethod)
            formData.append('note', payNote)
            if (payProof) formData.append('proof_image', payProof)
            const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: formData,
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setPayStmt(null)
            await loadData()
            setMsg({ type: 'ok', text: 'Payment submitted ✓' })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setPaying(false)
            setTimeout(() => setMsg(null), 5000)
        }
    }

    const viewDetail = async (id: string) => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch(`/api/statements/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        setDetail(await res.json())
    }

    const statusMsg: Record<string, string> = {
        draft: 'Bill not finalized yet — your landlord will publish it soon.',
        published: 'Your statement is ready — please review and pay.',
        partial: 'Partially paid — remaining balance is shown below.',
        paid: 'This month is fully paid. Thank you!',
        overdue: 'This statement is overdue — please pay as soon as possible.',
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">🧾 Current Statement</div>
                <div className="page-subtitle">{fmtM(CUR_M, CUR_Y)}</div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            {!current ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                    <div className="bold mb2" style={{ color: '#f8fafc' }}>No Statement Yet</div>
                    <div className="small muted">Your landlord hasn&apos;t generated a statement for {fmtM(CUR_M, CUR_Y)} yet.</div>
                </div>
            ) : (
                <>
                    {/* Status */}
                    <div className={`alert ${current.status === 'paid' ? 'a-ok' : current.status === 'overdue' ? 'a-err' : current.status === 'draft' ? 'a-info' : 'a-warn'} mb4`}>
                        <span className={`badge b-${current.status}`} style={{ marginRight: '0.5rem' }}>{current.status.toUpperCase()}</span>
                        {statusMsg[current.status] || ''}
                    </div>

                    {/* Big amount */}
                    <div className="card mb4" style={{ textAlign: 'center', padding: '2rem' }}>
                        <div className="small muted mb2">Total Due</div>
                        <div className="big-amount">{fmtINR(Number(current.total_due))}</div>
                        {Number(current.total_paid) > 0 && (
                            <div className="mt2 green mono bold" style={{ fontSize: '1rem' }}>Paid: {fmtINR(Number(current.total_paid))}</div>
                        )}
                        {Number(current.balance) > 0 && Number(current.total_paid) > 0 && (
                            <div className="mt2 red mono bold" style={{ fontSize: '1.1rem' }}>Balance: {fmtINR(Number(current.balance))}</div>
                        )}
                    </div>

                    {/* Breakdown */}
                    <div className="card mb4">
                        <div className="card-title">Itemized Breakdown</div>
                        <div className="card-inner" style={{ fontSize: '0.88rem' }}>
                            <div className="row between mb3"><span>🏠 Rent {current.is_prorated ? `(${current.proration_days} days prorated)` : ''}</span><span className="mono bold">{fmtINR(Number(current.rent_charge))}</span></div>
                            {Number(current.electricity_charge) > 0 && (
                                <div className="row between mb3"><span>⚡ Electricity ({current.electricity_units} kWh × ₹{Number(current.electricity_rate).toFixed(2)})</span><span className="mono bold">{fmtINR(Number(current.electricity_charge))}</span></div>
                            )}
                            <div className="row between mb3"><span>💧 Water</span><span className="mono bold">{fmtINR(Number(current.water_charge))}</span></div>
                            {Number(current.wifi_charge) > 0 && (
                                <div className="row between mb3"><span>📶 WiFi</span><span className="mono bold">{fmtINR(Number(current.wifi_charge))}</span></div>
                            )}
                            {(current.one_time_charges || []).map((c, i) => (
                                <div className="row between mb3" key={i}><span>🔸 {c.description}</span><span className="mono bold">{fmtINR(Number(c.amount))}</span></div>
                            ))}
                            {Number(current.previous_dues) > 0 && (
                                <div className="row between mb3"><span className="red">⭕ Previous Dues</span><span className="mono bold red">{fmtINR(Number(current.previous_dues))}</span></div>
                            )}
                            {Number(current.credit_from_previous) > 0 && (
                                <div className="row between mb3"><span className="green">✨ Credit Applied</span><span className="mono bold green">-{fmtINR(Number(current.credit_from_previous))}</span></div>
                            )}
                            <div className="div" />
                            <div className="row between"><span className="bold">Total Due</span><span className="mono bold amber" style={{ fontSize: '1.15rem' }}>{fmtINR(Number(current.total_due))}</span></div>
                        </div>
                    </div>

                    {/* Pay button */}
                    {Number(current.balance) > 0 && ['published', 'partial', 'overdue'].includes(current.status) && (
                        <button className="btn btn-amber btn-full mb4" style={{ padding: '0.875rem', fontSize: '0.95rem' }} onClick={() => openPay(current)}>
                            💳 Pay Now — {fmtINR(Number(current.balance))}
                        </button>
                    )}
                </>
            )}

            {/* Pay Modal */}
            {payStmt && (
                <div className="overlay" onClick={() => setPayStmt(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>Make Payment</h2>
                            <button className="close-btn" onClick={() => setPayStmt(null)}>×</button>
                        </div>
                        <div className="fg">
                            <label className="fl">Amount (₹)</label>
                            <input className="fi" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                            <div className="small muted mt2">Balance: {fmtINR(Number(payStmt.balance))}. You can pay partial or full.</div>
                        </div>
                        <div className="fg">
                            <label className="fl">Payment Method</label>
                            <select className="fi" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        <div className="fg">
                            <label className="fl">📸 Proof Screenshot</label>
                            <input type="file" accept="image/*" className="fi" onChange={e => setPayProof(e.target.files?.[0] || null)} />
                        </div>
                        <div className="fg">
                            <label className="fl">Note (optional)</label>
                            <input className="fi" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="e.g. Paid via Google Pay" />
                        </div>
                        <button className="btn btn-amber btn-full" onClick={submitPay} disabled={paying || !payAmount}>
                            {paying ? <><Spinner /> Submitting...</> : `✓ Submit Payment — ${fmtINR(Number(payAmount || 0))}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
