'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { fmtM, fmtDate, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { MeterReading } from '@/lib/types'

export default function TenantReadingPage() {
    const [readings, setReadings] = useState<MeterReading[]>([])
    const [loaded, setLoaded] = useState(false)
    const [selM, setSelM] = useState(CUR_M)
    const [selY, setSelY] = useState(CUR_Y)
    const [newReading, setNewReading] = useState('')
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)
    const [userId, setUserId] = useState('')

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data: { user } } = await supabase.auth.getUser()
        if (user) setUserId(user.id)
        const res = await fetch('/api/readings', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        setReadings(Array.isArray(data) ? data.sort((a: MeterReading, b: MeterReading) => (b.year * 12 + b.month) - (a.year * 12 + a.month)) : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const handleSubmit = async () => {
        if (!newReading) return
        setSaving(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const res = await fetch('/api/readings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ tenant_id: userId, month: selM, year: selY, reading_value: Number(newReading), source: 'manual' }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setNewReading('')
            await loadData()
            setMsg({ type: 'ok', text: `Reading saved for ${fmtM(selM, selY)} ✓` })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally { setSaving(false); setTimeout(() => setMsg(null), 4000) }
    }

    const handleOCR = async (file: File) => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const formData = new FormData()
            formData.append('image', file)
            const res = await fetch('/api/ocr/meter', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData })
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
                <div className="page-title">📟 Submit Meter Reading</div>
                <div className="page-subtitle">Enter this month&apos;s electricity meter reading</div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            <div className="card mb4">
                <div className="g2 mb3" style={{ maxWidth: 360 }}>
                    <div><label className="fl">Month</label><select className="fi" value={selM} onChange={e => setSelM(+e.target.value)}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
                    <div><label className="fl">Year</label><select className="fi" value={selY} onChange={e => setSelY(+e.target.value)}>{[CUR_Y - 1, CUR_Y, CUR_Y + 1].map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                </div>

                <div className="g2 mb3">
                    <div>
                        <label className="fl">Manual Entry</label>
                        <input className="fi" type="number" value={newReading} onChange={e => setNewReading(e.target.value)} placeholder="e.g. 12345" style={{ fontSize: '1.15rem', fontFamily: "'DM Mono', monospace" }} />
                    </div>
                    <div>
                        <label className="fl">📸 Photo OCR</label>
                        <input type="file" accept="image/*" className="fi" onChange={e => { if (e.target.files?.[0]) handleOCR(e.target.files[0]) }} />
                    </div>
                </div>

                <button className="btn btn-amber" onClick={handleSubmit} disabled={saving || !newReading}>
                    {saving ? <><Spinner /> Saving...</> : `✓ Submit Reading for ${fmtM(selM, selY)}`}
                </button>
            </div>

            <div className="card">
                <div className="card-title">Your Reading History</div>
                <div className="tbl-wrap">
                    <table className="tbl">
                        <thead><tr><th>Month</th><th>Reading</th><th>Source</th><th>Date</th></tr></thead>
                        <tbody>
                            {readings.length === 0 ? (
                                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>No readings yet</td></tr>
                            ) : readings.map(r => (
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
