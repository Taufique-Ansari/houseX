'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtM, fmtDate, PAYMENT_METHODS, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Payment, Tenant, Statement } from '@/lib/types'

type Category = 'rent' | 'electricity' | 'water' | 'wifi'

function getPendingForStatement(statementId: string, allStatements: Statement[], allPayments: Payment[]): Category[] {
    const stmt = allStatements.find(s => s.id === statementId)
    if (!stmt) return []
    const stmtPayments = allPayments.filter(p => p.statement_id === statementId)
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
        { key: 'rent', amt: Number(stmt.rent_charge) },
        { key: 'electricity', amt: Number(stmt.electricity_charge) },
        { key: 'water', amt: Number(stmt.water_charge) },
        { key: 'wifi', amt: Number(stmt.wifi_charge) },
    ]
    return allCats.filter(c => c.amt > 0 && !paidCats.has(c.key)).map(c => c.key)
}

const catIcons: Record<Category, string> = { rent: '🏠', electricity: '⚡', water: '💧', wifi: '📶' }
const catLabels: Record<Category, string> = { rent: 'Rent', electricity: 'Elec.', water: 'Water', wifi: 'WiFi' }

export default function PaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([])
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [statements, setStatements] = useState<Statement[]>([])
    const [loaded, setLoaded] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Record modal
    const [showRecord, setShowRecord] = useState(false)
    const [rTenant, setRTenant] = useState('')
    const [rStatement, setRStatement] = useState('')
    const [rAmount, setRAmount] = useState('')
    const [rMethod, setRMethod] = useState('upi')
    const [rNote, setRNote] = useState('')
    const [rProof, setRProof] = useState<File | null>(null)
    const [saving, setSaving] = useState(false)

    // Proof preview
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    const getHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return { Authorization: `Bearer ${session?.access_token}` }
    }

    const loadData = useCallback(async () => {
        const headers = await getHeaders()
        const [pRes, tRes, sRes] = await Promise.all([
            fetch('/api/payments', { headers }),
            fetch('/api/tenants', { headers }),
            fetch('/api/statements', { headers }),
        ])
        const pData = await pRes.json()
        const tData = await tRes.json()
        const sData = await sRes.json()
        setPayments(Array.isArray(pData) ? pData : [])
        setTenants(Array.isArray(tData) ? tData : [])
        setStatements(Array.isArray(sData) ? sData : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const tenantStatements = rTenant
        ? statements.filter(s => s.tenant_id === rTenant && ['published', 'partial', 'overdue'].includes(s.status))
        : []

    const handleRecord = async () => {
        if (!rStatement || !rAmount) return
        setSaving(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const formData = new FormData()
            formData.append('statement_id', rStatement)
            formData.append('amount', rAmount)
            formData.append('payment_method', rMethod)
            formData.append('note', rNote)
            if (rProof) formData.append('proof_image', rProof)
            const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: formData,
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setShowRecord(false); setRTenant(''); setRStatement(''); setRAmount(''); setRNote(''); setRProof(null)
            await loadData()
            setMsg({ type: 'ok', text: 'Payment recorded ✓' })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setSaving(false)
            setTimeout(() => setMsg(null), 4000)
        }
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="row between wrap">
                    <div>
                        <div className="page-title">💳 Payments</div>
                        <div className="page-subtitle">All payment records across tenants</div>
                    </div>
                    <button className="btn btn-amber" onClick={() => setShowRecord(true)}>➕ Record Payment</button>
                </div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            <div className="card">
                <div className="tbl-wrap">
                    <table className="tbl">
                        <thead><tr><th>Tenant</th><th>Statement</th><th>Amount</th><th>Method</th><th>Date</th><th>Note</th><th>Pending</th><th>Proof</th></tr></thead>
                        <tbody>
                            {payments.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#64748b' }}>No payments recorded yet</td></tr>
                            ) : payments.map(p => (
                                <tr key={p.id}>
                                    <td className="bold">{p.tenants?.profiles?.name || '—'}<br /><span className="small muted">{p.tenants?.flat}</span></td>
                                    <td>{p.statements ? fmtM(p.statements.month, p.statements.year) : '—'}</td>
                                    <td className="mono bold green">{fmtINR(Number(p.amount))}</td>
                                    <td><span className="badge b-info">{p.payment_method?.toUpperCase() || '—'}</span></td>
                                    <td className="small">{fmtDate(p.paid_at)}</td>
                                    <td className="small muted">{p.note || '—'}</td>
                                    <td>
                                        {(() => {
                                            const pending = p.statement_id ? getPendingForStatement(p.statement_id, statements, payments) : []
                                            if (pending.length === 0) {
                                                return <span className="green" style={{ fontSize: '0.78rem' }}>✓ None</span>
                                            }
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
                                        {p.proof_image_url ? (
                                            <button className="btn btn-ghost btn-sm" onClick={() => setPreviewUrl(p.proof_image_url!)}>
                                                🖼 View
                                            </button>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Proof Preview Modal */}
            {previewUrl && (
                <div className="overlay" onClick={() => setPreviewUrl(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, textAlign: 'center' }}>
                        <div className="modal-hd">
                            <h2>Payment Proof</h2>
                            <button className="close-btn" onClick={() => setPreviewUrl(null)}>×</button>
                        </div>
                        <img
                            src={previewUrl}
                            alt="Payment proof"
                            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12, border: '1px solid #2d3748' }}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                                const parent = (e.target as HTMLImageElement).parentElement
                                if (parent) {
                                    const msg = document.createElement('div')
                                    msg.className = 'alert a-err'
                                    msg.textContent = 'Failed to load image. The signed URL may have expired or the image was not uploaded successfully.'
                                    parent.appendChild(msg)
                                }
                            }}
                        />
                        <div className="mt3">
                            <a href={previewUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📥 Open in New Tab</a>
                        </div>
                    </div>
                </div>
            )}

            {/* Record Payment Modal */}
            {showRecord && (
                <div className="overlay" onClick={() => setShowRecord(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-hd">
                            <h2>Record Payment</h2>
                            <button className="close-btn" onClick={() => setShowRecord(false)}>×</button>
                        </div>
                        <div className="fg">
                            <label className="fl">Tenant</label>
                            <select className="fi" value={rTenant} onChange={e => { setRTenant(e.target.value); setRStatement('') }}>
                                <option value="">Select tenant</option>
                                {tenants.map(t => <option key={t.id} value={t.id}>{t.profiles?.name} ({t.flat})</option>)}
                            </select>
                        </div>
                        {rTenant && (
                            <div className="fg">
                                <label className="fl">Statement</label>
                                <select className="fi" value={rStatement} onChange={e => setRStatement(e.target.value)}>
                                    <option value="">Select statement</option>
                                    {tenantStatements.map(s => (
                                        <option key={s.id} value={s.id}>{fmtM(s.month, s.year)} — Balance: {fmtINR(Number(s.balance))}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="g2">
                            <div className="fg">
                                <label className="fl">Amount (₹)</label>
                                <input className="fi" type="number" value={rAmount} onChange={e => setRAmount(e.target.value)} placeholder="e.g. 5000" />
                            </div>
                            <div className="fg">
                                <label className="fl">Method</label>
                                <select className="fi" value={rMethod} onChange={e => setRMethod(e.target.value)}>
                                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="fg">
                            <label className="fl">Note (optional)</label>
                            <input className="fi" value={rNote} onChange={e => setRNote(e.target.value)} placeholder="e.g. Cash received" />
                        </div>
                        <div className="fg">
                            <label className="fl">Proof Image (optional)</label>
                            <input type="file" accept="image/*" className="fi" onChange={e => setRProof(e.target.files?.[0] || null)} />
                        </div>
                        <button className="btn btn-amber btn-full" onClick={handleRecord} disabled={saving || !rStatement || !rAmount}>
                            {saving ? <><Spinner /> Recording...</> : '✓ Record Payment'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
