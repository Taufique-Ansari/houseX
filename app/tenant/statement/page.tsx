'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, fmtDate, PAYMENT_METHODS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Statement, Payment } from '@/lib/types'

// ── Helpers to determine per-category paid status ──
type Category = 'rent' | 'electricity' | 'water' | 'wifi'

function getCategoriesPaidByPayments(payments: Payment[]): Set<Category> {
    const paid = new Set<Category>()
    for (const p of payments) {
        try {
            const parsed = JSON.parse(p.note || '{}')
            if (Array.isArray(parsed.categories)) {
                parsed.categories.forEach((c: string) => paid.add(c as Category))
            } else {
                // Legacy lump-sum payment — mark all categories as paid
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

function categoryLabel(cat: Category): string {
    switch (cat) {
        case 'rent': return '🏠 Rent'
        case 'electricity': return '⚡ Electricity'
        case 'water': return '💧 Water'
        case 'wifi': return '📶 WiFi'
    }
}

export default function TenantStatementPage() {
    const [statements, setStatements] = useState<Statement[]>([])
    const [loaded, setLoaded] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Statement details with payments (for per-category tracking)
    const [detail, setDetail] = useState<(Statement & { payments?: Payment[] }) | null>(null)

    // Main pay modal (for core charges: rent, electricity, water)
    const [payStmt, setPayStmt] = useState<Statement | null>(null)
    const [payMethod, setPayMethod] = useState('upi')
    const [payNote, setPayNote] = useState('')
    const [payProof, setPayProof] = useState<File | null>(null)
    const [paying, setPaying] = useState(false)
    const [selectedCats, setSelectedCats] = useState<Set<Category>>(new Set())

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
        setStatements(Array.isArray(data) ? data : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const current = statements.find(s => s.month === CUR_M && s.year === CUR_Y)

    // Auto-load detail for current statement to get per-category payment info
    useEffect(() => {
        if (!current) return
        const fetchDetail = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const res = await fetch(`/api/statements/${current.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
            setDetail(await res.json())
        }
        fetchDetail()
    }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    // Per-category paid status
    const paidCats = detail?.payments ? getCategoriesPaidByPayments(detail.payments) : new Set<Category>()

    // WiFi status
    const wifiAmount = current ? categoryAmount(current, 'wifi') : 0
    const wifiIsPaid = wifiAmount <= 0 || paidCats.has('wifi')

    // Core categories status (rent, electricity, water)
    const coreCats: Category[] = ['rent', 'electricity', 'water']
    const coreAllPaid = current
        ? coreCats.filter(c => categoryAmount(current, c) > 0).every(c => paidCats.has(c))
        : false

    // Display status: show as "paid" if all core charges are paid
    const displayStatus = current
        ? (coreAllPaid ? (wifiIsPaid ? 'paid' : 'paid') : current.status)
        : 'draft'

    const openPay = async (s: Statement) => {
        // Load full detail to get latest payments
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch(`/api/statements/${s.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        const fullStmt = await res.json()
        setDetail(fullStmt)

        const paid = getCategoriesPaidByPayments(fullStmt.payments || [])
        // Pre-select all unpaid CORE categories (not WiFi) that have an amount > 0
        const unpaid = new Set<Category>()
        for (const cat of coreCats) {
            if (!paid.has(cat) && categoryAmount(s, cat) > 0) {
                unpaid.add(cat)
            }
        }
        setSelectedCats(unpaid)
        setPayStmt(s)
        setPayMethod('upi')
        setPayNote('')
        setPayProof(null)
    }

    const toggleCat = (cat: Category) => {
        setSelectedCats(prev => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    const selectedTotal = payStmt
        ? Array.from(selectedCats).reduce((sum, cat) => sum + categoryAmount(payStmt, cat), 0)
        : 0

    const submitPay = async () => {
        if (!payStmt || selectedCats.size === 0) return
        setPaying(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const formData = new FormData()
            formData.append('statement_id', payStmt.id)
            formData.append('amount', String(selectedTotal))
            formData.append('payment_method', payMethod)
            const catNote = JSON.stringify({ categories: Array.from(selectedCats), userNote: payNote || undefined })
            formData.append('note', catNote)
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
            // Reload detail for current statement
            const detailRes = await fetch(`/api/statements/${payStmt.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
            setDetail(await detailRes.json())
            setMsg({ type: 'ok', text: `Payment of ${fmtINR(selectedTotal)} submitted ✓` })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setPaying(false)
            setTimeout(() => setMsg(null), 5000)
        }
    }

    // WiFi payment flow
    const openWifiPay = (s: Statement) => {
        setWifiPayStmt(s)
        setWifiPayMethod('upi')
        setWifiPayProof(null)
    }

    const submitWifiPay = async () => {
        if (!wifiPayStmt) return
        setWifiPaying(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const wifiAmt = categoryAmount(wifiPayStmt, 'wifi')
            const formData = new FormData()
            formData.append('statement_id', wifiPayStmt.id)
            formData.append('amount', String(wifiAmt))
            formData.append('payment_method', wifiPayMethod)
            const catNote = JSON.stringify({ categories: ['wifi'] })
            formData.append('note', catNote)
            if (wifiPayProof) formData.append('proof_image', wifiPayProof)
            const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: formData,
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setWifiPayStmt(null)
            await loadData()
            // Reload detail
            const detailRes = await fetch(`/api/statements/${wifiPayStmt.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
            setDetail(await detailRes.json())
            setMsg({ type: 'ok', text: `WiFi payment of ${fmtINR(wifiAmt)} submitted ✓` })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setWifiPaying(false)
            setTimeout(() => setMsg(null), 5000)
        }
    }

    const statusMsg: Record<string, string> = {
        draft: 'Bill not finalized yet — your landlord will publish it soon.',
        published: 'Your statement is ready — please review and pay.',
        partial: 'Partially paid — remaining balance is shown below.',
        paid: 'This month is fully paid. Thank you!',
        overdue: 'This statement is overdue — please pay as soon as possible.',
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    // Core amount = total excluding WiFi
    const coreTotal = current
        ? coreCats.reduce((sum, cat) => sum + categoryAmount(current, cat), 0)
        : 0
    const coreTotalWithExtras = current
        ? coreTotal +
          Number(current.previous_dues || 0) -
          Number(current.credit_from_previous || 0) +
          (current.one_time_charges || []).reduce((s, c) => s + Number(c.amount), 0)
        : 0

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
                    {/* ─── Status Banner ─── */}
                    <div className={`alert ${displayStatus === 'paid' ? 'a-ok' : displayStatus === 'overdue' ? 'a-err' : displayStatus === 'draft' ? 'a-info' : 'a-warn'} mb4`}>
                        <span className={`badge b-${displayStatus}`} style={{ marginRight: '0.5rem' }}>{displayStatus.toUpperCase()}</span>
                        {coreAllPaid && !wifiIsPaid
                            ? 'Core charges paid! WiFi charge is pending below.'
                            : statusMsg[displayStatus] || ''}
                    </div>

                    {/* ─── Main Bill Amount ─── */}
                    <div className="card mb4" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div className="small muted mb2">Total Due (Rent + Electricity + Water)</div>
                        <div className="big-amount">{fmtINR(coreTotalWithExtras)}</div>
                        {coreAllPaid && (
                            <div className="mt2 green mono bold" style={{ fontSize: '1rem' }}>✓ Paid</div>
                        )}
                    </div>

                    {/* ─── Itemized Breakdown ─── */}
                    <div className="card mb4">
                        <div className="card-title">Itemized Breakdown</div>
                        <div className="card-inner" style={{ fontSize: '0.88rem' }}>
                            {/* Rent */}
                            <div className="row between mb3 breakdown-row">
                                <span>🏠 Rent {current.is_prorated ? `(${current.proration_days} days prorated)` : ''}</span>
                                <div className="row" style={{ gap: '0.5rem' }}>
                                    <span className="mono bold">{fmtINR(Number(current.rent_charge))}</span>
                                    {detail && <span className={`badge ${paidCats.has('rent') ? 'b-paid' : 'b-overdue'}`} style={{ fontSize: '0.6rem' }}>{paidCats.has('rent') ? '✓' : '⏳'}</span>}
                                </div>
                            </div>
                            {/* Electricity */}
                            {Number(current.electricity_charge) > 0 && (
                                <div className="row between mb3 breakdown-row">
                                    <span>⚡ Electricity ({current.electricity_units} kWh × ₹{Number(current.electricity_rate).toFixed(2)})</span>
                                    <div className="row" style={{ gap: '0.5rem' }}>
                                        <span className="mono bold">{fmtINR(Number(current.electricity_charge))}</span>
                                        {detail && <span className={`badge ${paidCats.has('electricity') ? 'b-paid' : 'b-overdue'}`} style={{ fontSize: '0.6rem' }}>{paidCats.has('electricity') ? '✓' : '⏳'}</span>}
                                    </div>
                                </div>
                            )}
                            {/* Water */}
                            <div className="row between mb3 breakdown-row">
                                <span>💧 Water</span>
                                <div className="row" style={{ gap: '0.5rem' }}>
                                    <span className="mono bold">{fmtINR(Number(current.water_charge))}</span>
                                    {detail && <span className={`badge ${paidCats.has('water') ? 'b-paid' : 'b-overdue'}`} style={{ fontSize: '0.6rem' }}>{paidCats.has('water') ? '✓' : '⏳'}</span>}
                                </div>
                            </div>
                            {/* One-time charges */}
                            {(current.one_time_charges || []).map((c, i) => (
                                <div className="row between mb3 breakdown-row" key={i}><span>🔸 {c.description}</span><span className="mono bold">{fmtINR(Number(c.amount))}</span></div>
                            ))}
                            {/* Previous dues */}
                            {Number(current.previous_dues) > 0 && (
                                <div className="row between mb3 breakdown-row"><span className="red">⭕ Previous Dues</span><span className="mono bold red">{fmtINR(Number(current.previous_dues))}</span></div>
                            )}
                            {/* Credit */}
                            {Number(current.credit_from_previous) > 0 && (
                                <div className="row between mb3 breakdown-row"><span className="green">✨ Credit Applied</span><span className="mono bold green">-{fmtINR(Number(current.credit_from_previous))}</span></div>
                            )}
                            <div className="div" />
                            <div className="row between breakdown-row">
                                <span className="bold">Total (excl. WiFi)</span>
                                <span className="mono bold amber" style={{ fontSize: '1.15rem' }}>{fmtINR(coreTotalWithExtras)}</span>
                            </div>
                        </div>
                    </div>

                    {/* ─── Pay Button for Core Charges ─── */}
                    {!coreAllPaid && ['published', 'partial', 'overdue'].includes(current.status) && (
                        <button className="btn btn-amber btn-full mb4" style={{ padding: '0.875rem', fontSize: '0.95rem' }} onClick={() => openPay(current)}>
                            💳 Pay Now — {fmtINR(coreTotalWithExtras)}
                        </button>
                    )}

                    {/* ═══════════════════════════════════════════ */}
                    {/* ─── WiFi Dues Section ─── */}
                    {/* ═══════════════════════════════════════════ */}
                    {wifiAmount > 0 && (
                        <div className="card mb4" style={{ borderColor: wifiIsPaid ? '#052e1644' : '#f59e0b33' }}>
                            <div className="row between wrap mb3">
                                <div className="card-title" style={{ marginBottom: 0 }}>📶 WiFi Charges</div>
                                <span className={`badge ${wifiIsPaid ? 'b-paid' : 'b-overdue'}`}>
                                    {wifiIsPaid ? '✓ PAID' : '⏳ PENDING'}
                                </span>
                            </div>
                            <div className="card-inner" style={{ textAlign: 'center', padding: '1.25rem' }}>
                                <div className="small muted mb2">Monthly WiFi Charge</div>
                                <div className="mono bold" style={{ fontSize: '1.75rem', color: wifiIsPaid ? '#6ee7b7' : '#f59e0b' }}>
                                    {fmtINR(wifiAmount)}
                                </div>
                                {wifiIsPaid && detail?.payments && (
                                    <div className="small muted mt2">
                                        Paid on {fmtDate(detail.payments.find(p => {
                                            try {
                                                const parsed = JSON.parse(p.note || '{}')
                                                return Array.isArray(parsed.categories) && parsed.categories.includes('wifi')
                                            } catch { return false }
                                        })?.paid_at || '')}
                                    </div>
                                )}
                            </div>
                            {!wifiIsPaid && ['published', 'partial', 'paid', 'overdue'].includes(current.status) && (
                                <button
                                    className="btn btn-full mt3"
                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', padding: '0.75rem', fontSize: '0.9rem' }}
                                    onClick={() => openWifiPay(current)}
                                >
                                    📶 Pay WiFi — {fmtINR(wifiAmount)}
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ─── Main Pay Modal (Core Charges) ─── */}
            {payStmt && (
                <div className="overlay" onClick={() => setPayStmt(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>Select What to Pay</h2>
                            <button className="close-btn" onClick={() => setPayStmt(null)}>×</button>
                        </div>

                        <div className="alert a-info mb4" style={{ fontSize: '0.78rem' }}>
                            Choose which charges you want to pay now. WiFi can be paid separately from the WiFi section below.
                        </div>

                        {/* Category checkboxes (core only — no WiFi) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
                            {coreCats.map(cat => {
                                const amt = categoryAmount(payStmt, cat)
                                if (amt <= 0) return null
                                const alreadyPaid = paidCats.has(cat)

                                return (
                                    <label key={cat} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        padding: '0.75rem 1rem', borderRadius: '10px',
                                        background: alreadyPaid ? '#052e1622' : selectedCats.has(cat) ? '#f59e0b11' : '#1c2536',
                                        border: `1px solid ${alreadyPaid ? '#14532d' : selectedCats.has(cat) ? '#f59e0b55' : '#2d3748'}`,
                                        cursor: alreadyPaid ? 'default' : 'pointer',
                                        opacity: alreadyPaid ? 0.6 : 1,
                                        flexWrap: 'wrap',
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={alreadyPaid || selectedCats.has(cat)}
                                            disabled={alreadyPaid}
                                            onChange={() => !alreadyPaid && toggleCat(cat)}
                                            style={{ width: '18px', height: '18px', accentColor: '#f59e0b', flexShrink: 0 }}
                                        />
                                        <span style={{ flex: 1, fontSize: '0.85rem', color: '#e2e8f0' }}>
                                            {categoryLabel(cat)}
                                            {alreadyPaid && <span className="badge b-paid" style={{ marginLeft: '0.5rem', fontSize: '0.62rem' }}>Already Paid</span>}
                                        </span>
                                        <span className="mono bold" style={{ color: alreadyPaid ? '#6ee7b7' : '#f59e0b', fontSize: '0.9rem' }}>
                                            {fmtINR(amt)}
                                        </span>
                                    </label>
                                )
                            })}
                        </div>

                        {/* Selected total */}
                        {selectedCats.size > 0 && (
                            <div className="card-inner mb4" style={{ textAlign: 'center' }}>
                                <div className="small muted mb1">You will pay</div>
                                <div className="mono bold amber" style={{ fontSize: '1.5rem' }}>{fmtINR(selectedTotal)}</div>
                            </div>
                        )}

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
                            <input className="fi" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="e.g. Paying rent + water only" />
                        </div>
                        <button className="btn btn-amber btn-full" onClick={submitPay} disabled={paying || selectedCats.size === 0}>
                            {paying ? <><Spinner /> Submitting...</> : `✓ Submit Payment — ${fmtINR(selectedTotal)}`}
                        </button>
                    </div>
                </div>
            )}

            {/* ─── WiFi Pay Modal ─── */}
            {wifiPayStmt && (
                <div className="overlay" onClick={() => setWifiPayStmt(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>📶 Pay WiFi Charge</h2>
                            <button className="close-btn" onClick={() => setWifiPayStmt(null)}>×</button>
                        </div>

                        <div className="card-inner mb4" style={{ textAlign: 'center' }}>
                            <div className="small muted mb2">WiFi Charge for {fmtM(wifiPayStmt.month, wifiPayStmt.year)}</div>
                            <div className="mono bold" style={{ fontSize: '2rem', color: '#8b5cf6' }}>
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
                            {wifiPaying ? <><Spinner /> Submitting...</> : `✓ Pay WiFi — ${fmtINR(categoryAmount(wifiPayStmt, 'wifi'))}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
