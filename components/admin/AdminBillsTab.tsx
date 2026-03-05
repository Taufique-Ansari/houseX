'use client'

import { useState } from 'react'
import Modal from '@/components/Modal'
import { fmtINR, fmtM } from '@/lib/utils'
import type { Bill } from '@/lib/utils'

interface AdminBillsTabProps {
    bills: Bill[]
}

export default function AdminBillsTab({ bills }: AdminBillsTabProps) {
    const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all')
    const [viewProof, setViewProof] = useState<string | null>(null)

    const filtered = bills
        .filter(b => filter === 'all' || b.status === filter)
        .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())

    const totalAmount = filtered.reduce((s, b) => s + b.amount, 0)

    return (
        <div className="page">
            <div className="row between mb4 wrap" style={{ gap: '0.75rem' }}>
                <div>
                    <span className="bold" style={{ color: '#f8fafc' }}>All Bills</span>
                    <span className="small muted" style={{ marginLeft: '0.75rem' }}>{filtered.length} bills · {fmtINR(totalAmount)} total</span>
                </div>
                <div className="row" style={{ gap: '0.5rem' }}>
                    {(['all', 'pending', 'paid'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? 'btn-amber' : 'btn-ghost'}`}>
                            {f === 'all' ? 'All' : f === 'pending' ? '⏳ Pending' : '✓ Paid'}
                        </button>
                    ))}
                </div>
            </div>

            {filtered.length === 0
                ? <div className="empty card"><div className="empty-icon">🧾</div><div style={{ fontSize: '0.85rem' }}>No bills found</div></div>
                : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="tbl">
                            <thead>
                                <tr><th>Tenant</th><th>Month</th><th>Units</th><th>Rate</th><th>Amount</th><th>Status</th><th>Proof</th></tr>
                            </thead>
                            <tbody>
                                {filtered.map(b => (
                                    <tr key={b.id}>
                                        <td>
                                            <div className="bold" style={{ color: '#f8fafc' }}>{b.profiles?.name || '—'}</div>
                                            <div className="small muted">{b.profiles?.flat || '—'}</div>
                                        </td>
                                        <td>{fmtM(b.month, b.year)}</td>
                                        <td className="mono">{b.units_used} kWh</td>
                                        <td className="mono small">₹{b.per_unit_rate.toFixed(2)}</td>
                                        <td className="mono amber bold">{fmtINR(b.amount)}</td>
                                        <td><span className={`badge ${b.status === 'paid' ? 'b-paid' : 'b-pending'}`}>{b.status === 'paid' ? '✓ Paid' : '⏳ Pending'}</span></td>
                                        <td>
                                            {b.payment_proof_url
                                                ? <button className="btn btn-ghost btn-sm" onClick={() => setViewProof(b.payment_proof_url)}>View</button>
                                                : <span className="muted small">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>}

            <Modal open={!!viewProof} onClose={() => setViewProof(null)} title="Payment Proof">
                {viewProof && <img src={viewProof} style={{ width: '100%', borderRadius: '10px' }} alt="Payment Proof" />}
            </Modal>
        </div>
    )
}
