'use client'

import { useState } from 'react'
import Spinner from '@/components/Spinner'
import BillUpload from '@/components/BillUpload'
import { fmtINR, fmtM, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Bill, Profile, MeterReading, ElectricityRate } from '@/lib/types'

interface RateTabProps {
    rates: ElectricityRate[]
    token: string
    onRatesUpdated: () => void
}

export default function RateTab({ rates, token, onRatesUpdated }: RateTabProps) {
    const [mode, setMode] = useState<'bill' | 'manual'>('bill')
    const [month, setMonth] = useState(CUR_M)
    const [year, setYear] = useState(CUR_Y)
    const [units, setUnits] = useState('')
    const [amount, setAmount] = useState('')
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    const perUnit = units && amount && +units > 0 ? (+amount / +units) : null
    const existing = rates.find(r => r.month === +month && r.year === +year)

    const handleExtracted = (data: { units: number; amount: number }) => {
        setUnits(String(data.units))
        setAmount(String(data.amount))
    }

    const save = async () => {
        if (!units || !amount || +units <= 0) return
        setSaving(true)
        try {
            const res = await fetch('/api/rates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    month: +month,
                    year: +year,
                    total_units: +units,
                    total_amount: +amount,
                    source: mode === 'bill' ? 'bill_ocr' : 'manual',
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onRatesUpdated()
            setMsg({ type: 'ok', text: `Rate set: ₹${(+amount / +units).toFixed(4)}/unit for ${fmtM(+month, +year)}` })
            setTimeout(() => setMsg(null), 3500)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save'
            setMsg({ type: 'err', text: message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="page">
            <div className="card" style={{ maxWidth: 580 }}>
                <div className="row between mb6">
                    <div>
                        <div className="bold" style={{ color: '#f8fafc', fontSize: '0.95rem' }}>Set Per-Unit Rate</div>
                        <div className="small muted mt1">Used to calculate tenant electricity bills</div>
                    </div>
                </div>

                <div className="g2 mb4">
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Month</label>
                        <select className="fi" value={month} onChange={e => setMonth(+e.target.value)}>
                            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Year</label>
                        <select className="fi" value={year} onChange={e => setYear(+e.target.value)}>
                            {[CUR_Y - 1, CUR_Y, CUR_Y + 1].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>

                {existing && (
                    <div className="alert a-info mb4">
                        ℹ️ Rate for {fmtM(+month, +year)} already set at ₹{existing.per_unit_rate.toFixed(4)}/unit. Saving again will overwrite it.
                    </div>
                )}

                <div className="row mb4">
                    <button onClick={() => setMode('bill')} className={`btn btn-sm ${mode === 'bill' ? 'btn-amber' : 'btn-ghost'}`}>📄 Upload Bill (AI)</button>
                    <button onClick={() => setMode('manual')} className={`btn btn-sm ${mode === 'manual' ? 'btn-amber' : 'btn-ghost'}`}>✏️ Enter Manually</button>
                </div>

                {mode === 'bill' && (
                    <div className="mb4">
                        <BillUpload onExtracted={handleExtracted} />
                    </div>
                )}

                <div className="g2 mb4">
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Total Units Consumed (kWh)</label>
                        <input className="fi" type="number" value={units} onChange={e => setUnits(e.target.value)} placeholder="e.g., 420" />
                    </div>
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Total Amount Payable (₹)</label>
                        <input className="fi" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g., 3150" />
                    </div>
                </div>

                {perUnit && (
                    <div className="card-inner mb4 center">
                        <div className="small muted mb2">Calculated Per-Unit Rate</div>
                        <div style={{ fontSize: '2.25rem', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>₹{perUnit.toFixed(4)}</div>
                        <div className="small muted mt1">per kWh</div>
                    </div>
                )}

                {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb3`}>{msg.text}</div>}

                <button className="btn btn-amber" onClick={save} disabled={!units || !amount || +units <= 0 || saving}>
                    {saving ? <><Spinner /> Saving...</> : `💾 Save Rate for ${fmtM(+month, +year)}`}
                </button>
            </div>

            {rates.length > 0 && (
                <div className="card mt4">
                    <div className="card-title">Rate History</div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="tbl">
                            <thead><tr><th>Month</th><th>Total Units</th><th>Total Amount</th><th>Per Unit</th><th>Source</th></tr></thead>
                            <tbody>
                                {[...rates].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map(r => (
                                    <tr key={r.id}>
                                        <td className="bold">{fmtM(r.month || 0, r.year || 0)}</td>
                                        <td className="mono">{r.total_units || 0} kWh</td>
                                        <td className="mono">{r.total_amount ? fmtINR(r.total_amount) : '—'}</td>
                                        <td className="mono amber bold">₹{r.per_unit_rate.toFixed(4)}</td>
                                        <td><span className={`badge ${r.source === 'bill_ocr' ? 'b-info' : 'b-warn'}`}>{r.source === 'bill_ocr' ? '🤖 AI' : '✏️ Manual'}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
