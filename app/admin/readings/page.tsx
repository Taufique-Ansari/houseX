'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtM, fmtDate, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { MeterReading, Tenant } from '@/lib/types'

export default function ReadingsPage() {
    const [readings, setReadings] = useState<MeterReading[]>([])
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loaded, setLoaded] = useState(false)
    const [selTenant, setSelTenant] = useState('')
    const [selM, setSelM] = useState(CUR_M)
    const [selY, setSelY] = useState(CUR_Y)
    const [addOpen, setAddOpen] = useState(false)
    const [newReading, setNewReading] = useState('')
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    const getHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return { Authorization: `Bearer ${session?.access_token}` }
    }

    const loadData = useCallback(async () => {
        const headers = await getHeaders()
        const [readingsRes, tenantsRes] = await Promise.all([
            fetch('/api/readings', { headers }),
            fetch('/api/tenants', { headers }),
        ])
        const rData = await readingsRes.json()
        const tData = await tenantsRes.json()
        setReadings(Array.isArray(rData) ? rData : [])
        setTenants(Array.isArray(tData) ? tData : [])
        if (!selTenant && Array.isArray(tData) && tData.length > 0) setSelTenant(tData[0].id)
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const tenantReadings = readings.filter(r => r.tenant_id === selTenant)
        .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))

    const handleSubmit = async () => {
        if (!selTenant || !newReading) return
        setSaving(true); setMsg(null)
        try {
            const headers = { ...(await getHeaders()), 'Content-Type': 'application/json' }
            const res = await fetch('/api/readings', {
                method: 'POST', headers,
                body: JSON.stringify({ tenant_id: selTenant, month: selM, year: selY, reading_value: Number(newReading), source: 'manual' }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setNewReading(''); setAddOpen(false)
            await loadData()
            setMsg({ type: 'ok', text: `Reading saved for ${fmtM(selM, selY)} ✓` })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setSaving(false)
            setTimeout(() => setMsg(null), 4000)
        }
    }

    const handleOCR = async (file: File) => {
        try {
            const headers = await getHeaders()
            const formData = new FormData()
            formData.append('image', file)
            const res = await fetch('/api/ocr/meter', {
                method: 'POST', headers, body: formData,
            })
            const data = await res.json()
            if (data.success && data.reading) {
                setNewReading(String(data.reading))
                setMsg({ type: 'ok', text: `OCR detected: ${data.reading}` })
            } else {
                setMsg({ type: 'err', text: 'OCR failed — enter manually' })
            }
        } catch { setMsg({ type: 'err', text: 'OCR failed' }) }
        setTimeout(() => setMsg(null), 5000)
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">📟 Meter Readings</div>
                <div className="page-subtitle">Add and view meter readings per tenant</div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            {/* Selectors */}
            <div className="g3 mb4" style={{ maxWidth: 600 }}>
                <select className="fi" value={selTenant} onChange={e => setSelTenant(e.target.value)}>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.profiles?.name} ({t.flat})</option>)}
                </select>
                <select className="fi" value={selM} onChange={e => setSelM(+e.target.value)}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select className="fi" value={selY} onChange={e => setSelY(+e.target.value)}>
                    {[CUR_Y - 1, CUR_Y, CUR_Y + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            {/* Add reading */}
            {!addOpen ? (
                <button className="btn btn-amber mb4" onClick={() => setAddOpen(true)}>➕ Add Reading for {fmtM(selM, selY)}</button>
            ) : (
                <div className="card mb4" style={{ maxWidth: 540 }}>
                    <div className="card-title">Add Reading — {fmtM(selM, selY)}</div>
                    <div className="g2 mb3">
                        <div>
                            <label className="fl">Manual Entry</label>
                            <input className="fi" type="number" value={newReading} onChange={e => setNewReading(e.target.value)} placeholder="e.g. 1234" />
                        </div>
                        <div>
                            <label className="fl">📸 Photo OCR</label>
                            <input type="file" accept="image/*" className="fi" onChange={e => { if (e.target.files?.[0]) handleOCR(e.target.files[0]) }} />
                        </div>
                    </div>
                    <div className="row" style={{ gap: '0.5rem' }}>
                        <button className="btn btn-amber" onClick={handleSubmit} disabled={saving || !newReading}>
                            {saving ? <><Spinner /> Saving...</> : '✓ Save Reading'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => { setAddOpen(false); setNewReading('') }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* History */}
            <div className="card">
                <div className="card-title">Reading History</div>
                <div className="tbl-wrap">
                    <table className="tbl">
                        <thead><tr><th>Month</th><th>Reading</th><th>Source</th><th>Submitted</th></tr></thead>
                        <tbody>
                            {tenantReadings.length === 0 ? (
                                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>No readings found</td></tr>
                            ) : tenantReadings.map(r => (
                                <tr key={r.id}>
                                    <td className="bold">{fmtM(r.month, r.year)}</td>
                                    <td className="mono bold amber" style={{ fontSize: '1rem' }}>{Number(r.reading_value).toLocaleString()}</td>
                                    <td><span className={`badge ${r.source === 'ocr' ? 'b-info' : 'b-draft'}`}>{r.source === 'ocr' ? '🤖 OCR' : '✏️ Manual'}</span></td>
                                    <td className="small muted">{fmtDate(r.submitted_at || '')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
