'use client'

import { useState } from 'react'
import Spinner from '@/components/Spinner'
import Modal from '@/components/Modal'
import MeterInput from '@/components/MeterInput'
import { fmtINR, fmtM, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Bill, Profile, MeterReading, ElectricityRate } from '@/lib/types'

interface ReadingsTabProps {
    readings: MeterReading[]
    bills: Bill[]
    rates: ElectricityRate[]
    users: Profile[]
    token: string
    onDataUpdated: () => void
}

export default function ReadingsTab({ readings, bills, rates, users, token, onDataUpdated }: ReadingsTabProps) {
    const tenants = users.filter(u => u.role === 'tenant')
    const [tid, setTid] = useState(tenants[0]?.id || '')
    const [selM, setSelM] = useState(CUR_M)
    const [selY, setSelY] = useState(CUR_Y)
    const [showAdd, setShowAdd] = useState(false)
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)
    const [editId, setEditId] = useState<string | null>(null)
    const [editVal, setEditVal] = useState('')
    const [editLoading, setEditLoading] = useState(false)

    const showMsg = (type: string, text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000) }

    const tenantReadings = readings
        .filter(r => r.tenant_id === tid)
        .sort((a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime())

    const curReading = readings.find(r => r.tenant_id === tid && r.month === selM && r.year === selY)
    const existingBill = bills.find(b => b.tenant_id === tid && b.month === selM && b.year === selY)
    const currentRate = rates.find(r => r.month === selM && r.year === selY)

    const addReading = async (val: number) => {
        try {
            const res = await fetch('/api/readings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    user_id: tid,
                    month: selM,
                    year: selY,
                    reading_value: val,
                    source: 'manual',
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onDataUpdated()
            setShowAdd(false)
            showMsg('ok', `Reading ${val} saved for ${fmtM(selM, selY)}`)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save reading'
            showMsg('err', message)
        }
    }

    const deleteReading = async (id: string) => {
        if (!confirm('Are you sure you want to delete this reading?')) return
        try {
            const res = await fetch(`/api/readings/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onDataUpdated()
            showMsg('ok', 'Reading deleted successfully')
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to delete reading'
            showMsg('err', message)
        }
    }

    const modifyReading = async () => {
        if (!editId || !editVal || isNaN(Number(editVal))) return
        setEditLoading(true)
        try {
            const res = await fetch(`/api/readings/${editId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ reading_value: Number(editVal) }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onDataUpdated()
            setEditId(null)
            setEditVal('')
            showMsg('ok', 'Reading updated successfully')
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to update reading'
            showMsg('err', message)
        } finally {
            setEditLoading(false)
        }
    }

    const generateBill = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/bills/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ user_id: tid, month: selM, year: selY }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onDataUpdated()
            showMsg('ok', `Bill generated: ${fmtINR(data.amount)} for ${users.find(u => u.id === tid)?.name} (${data.units_used} units × ₹${data.per_unit_rate.toFixed(4)})`)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to generate bill'
            showMsg('err', message)
        } finally {
            setLoading(false)
        }
    }

    const [prevMonth, prevYear] = selM === 1 ? [12, selY - 1] : [selM - 1, selY]
    const prevReading = readings.find(r => r.tenant_id === tid && r.month === prevMonth && r.year === prevYear)

    return (
        <div className="page">
            <div className="card mb4">
                <div className="g3 mb4" style={{ gap: '0.75rem' }}>
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Tenant</label>
                        <select className="fi" value={tid} onChange={e => setTid(e.target.value)}>
                            <optgroup label="Select Tenant">
                                {users.filter(u => u.role === 'tenant').map(u => (
                                    <option key={u.id} value={u.id}>{u.name} — {(u as any).flat}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Month</label>
                        <select className="fi" value={selM} onChange={e => setSelM(+e.target.value)}>
                            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Year</label>
                        <select className="fi" value={selY} onChange={e => setSelY(+e.target.value)}>
                            {[CUR_Y - 1, CUR_Y, CUR_Y + 1].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>

                {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb3`}>{msg.text}</div>}

                {/* Bill generation requirements checklist */}
                <div className="card-inner mb3" style={{ padding: '0.75rem', fontSize: '0.82rem' }}>
                    <div className="small muted mb2" style={{ fontWeight: 700 }}>Bill Generation Requirements for {fmtM(selM, selY)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <div>{currentRate ? '✅' : '❌'} Rate set for {fmtM(selM, selY)} {currentRate ? `(₹${currentRate.per_unit_rate.toFixed(4)}/unit)` : '— set in Rate Setting tab'}</div>
                        <div>{prevReading ? '✅' : '❌'} Previous month reading ({fmtM(prevMonth, prevYear)}) {prevReading ? `— ${prevReading.reading_value}` : '— add reading first'}</div>
                        <div>{curReading ? '✅' : '❌'} Current month reading ({fmtM(selM, selY)}) {curReading ? `— ${curReading.reading_value}` : '— add reading first'}</div>
                        {curReading && prevReading && (
                            <div style={{ color: '#f59e0b', fontWeight: 600, marginTop: '0.25rem' }}>
                                Units consumed: {curReading.reading_value} − {prevReading.reading_value} = {curReading.reading_value - prevReading.reading_value} kWh
                            </div>
                        )}
                    </div>
                </div>

                <div className="row wrap" style={{ gap: '0.5rem' }}>
                    <button className="btn btn-amber" onClick={() => setShowAdd(true)}>+ Add Reading</button>
                    <button className="btn btn-green" onClick={generateBill} disabled={loading}>
                        {loading ? <><Spinner /> Generating...</> : existingBill ? '↺ Regenerate Bill' : '⚡ Generate Bill'}
                    </button>
                </div>

                {curReading && (
                    <div className="card-inner mt3">
                        <div className="row between">
                            <div>
                                <div className="small muted mb1">{fmtM(selM, selY)} Reading</div>
                                <div className="mono bold amber" style={{ fontSize: '1.25rem' }}>{curReading.reading_value}</div>
                            </div>
                            <span className={`badge ${curReading.source === 'ocr' ? 'b-info' : 'b-warn'}`}>
                                {curReading.source === 'ocr' ? '🤖 OCR' : '✏️ Manual'}
                            </span>
                        </div>
                        {curReading.photo_url && (
                            <img src={curReading.photo_url} style={{ width: '100%', maxHeight: '120px', objectFit: 'contain', marginTop: '0.75rem', borderRadius: '6px' }} alt="Meter" />
                        )}
                    </div>
                )}

                {existingBill && (
                    <div className="card-inner mt3" style={{ borderColor: '#f59e0b55' }}>
                        <div className="row between">
                            <div>
                                <div className="small muted mb1">Generated Bill — {fmtM(selM, selY)}</div>
                                <div className="mono amber bold" style={{ fontSize: '1.5rem' }}>{fmtINR(existingBill.amount)}</div>
                                <div className="small muted mt1">{existingBill.units_used} units × ₹{existingBill.per_unit_rate.toFixed(4)}/unit</div>
                            </div>
                            <span className={`badge ${existingBill.status === 'paid' ? 'b-paid' : 'b-pending'}`}>{existingBill.status}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-title">Reading History — {users.find(u => u.id === tid)?.name}</div>
                {tenantReadings.length === 0
                    ? <div className="empty"><div className="empty-icon">📊</div><div style={{ fontSize: '0.85rem' }}>No readings yet</div></div>
                    : <table className="tbl">
                        <thead><tr><th>Month</th><th>Reading</th><th>Source</th><th>Submitted</th><th>Actions</th></tr></thead>
                        <tbody>
                            {tenantReadings.map(r => (
                                <tr key={r.id}>
                                    <td className="bold">{fmtM(r.month, r.year)}</td>
                                    <td className="mono amber">{r.reading_value}</td>
                                    <td><span className={`badge ${r.source === 'ocr' ? 'b-info' : 'b-warn'}`}>{r.source === 'ocr' ? '🤖 OCR' : '✏️ Manual'}</span></td>
                                    <td className="muted">{new Date(r.submitted_at || 0).toLocaleDateString('en-IN')}</td>
                                    <td>
                                        <div className="row" style={{ gap: '0.35rem' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(r.id); setEditVal(String(r.reading_value)) }} title="Modify">✏️</button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => deleteReading(r.id)} title="Delete" style={{ color: '#ef4444' }}>🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>}
            </div>

            {/* Add Reading Modal */}
            <Modal open={showAdd} onClose={() => setShowAdd(false)} title={`Add Reading — ${users.find(u => u.id === tid)?.name} · ${fmtM(selM, selY)}`}>
                {curReading && <div className="alert a-warn mb4">⚠️ A reading already exists ({curReading.reading_value}). Submitting will overwrite it.</div>}
                <MeterInput onConfirm={addReading} />
            </Modal>

            {/* Edit Reading Modal */}
            <Modal open={!!editId} onClose={() => { setEditId(null); setEditVal('') }} title="Modify Reading">
                <div className="fg">
                    <label className="fl">New Reading Value</label>
                    <input
                        className="fi"
                        type="number"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        placeholder="Enter new reading"
                        onKeyDown={e => e.key === 'Enter' && modifyReading()}
                    />
                </div>
                <button className="btn btn-amber btn-full" onClick={modifyReading} disabled={!editVal || isNaN(Number(editVal)) || editLoading}>
                    {editLoading ? <><Spinner /> Saving...</> : '💾 Save Changes'}
                </button>
            </Modal>
        </div>
    )
}
