'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import Modal from '@/components/Modal'
import { fmtINR, fmtM, fmtDate, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { UtilityConfig } from '@/lib/types'

export default function UtilitiesPage() {
    const [configs, setConfigs] = useState<UtilityConfig[]>([])
    const [loaded, setLoaded] = useState(false)
    const [selM, setSelM] = useState(CUR_M)
    const [selY, setSelY] = useState(CUR_Y)
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Form
    const [elecUnits, setElecUnits] = useState('')
    const [elecAmount, setElecAmount] = useState('')
    const [elecSource, setElecSource] = useState<'manual' | 'bill_ocr'>('manual')
    const [waterCharge, setWaterCharge] = useState('100')
    const [wifiCharge, setWifiCharge] = useState('200')

    const loadData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/utility-config', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json()
        setConfigs(Array.isArray(data) ? data : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    // Pre-fill form when month changes
    useEffect(() => {
        const existing = configs.find(c => c.month === selM && c.year === selY)
        if (existing) {
            setElecUnits(existing.electricity_total_units?.toString() || '')
            setElecAmount(existing.electricity_total_amount?.toString() || '')
            setElecSource(existing.electricity_source || 'manual')
            setWaterCharge(existing.water_charge_per_tenant?.toString() || '100')
            setWifiCharge(existing.wifi_charge_per_tenant?.toString() || '200')
        } else {
            setElecUnits(''); setElecAmount(''); setElecSource('manual')
            setWaterCharge('100'); setWifiCharge('200')
        }
    }, [selM, selY, configs])

    const perUnitRate = (elecUnits && elecAmount && Number(elecUnits) > 0)
        ? (Number(elecAmount) / Number(elecUnits)).toFixed(4)
        : '—'

    const handleSave = async () => {
        setSaving(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const res = await fetch('/api/utility-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    month: selM, year: selY,
                    electricity_total_units: elecUnits ? Number(elecUnits) : null,
                    electricity_total_amount: elecAmount ? Number(elecAmount) : null,
                    electricity_per_unit_rate: (elecUnits && elecAmount && Number(elecUnits) > 0) ? Number(elecAmount) / Number(elecUnits) : null,
                    electricity_source: elecSource,
                    water_charge_per_tenant: Number(waterCharge),
                    wifi_charge_per_tenant: Number(wifiCharge),
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            await loadData()
            setMsg({ type: 'ok', text: `Utilities saved for ${fmtM(selM, selY)} ✓` })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save'
            setMsg({ type: 'err', text: message })
        } finally {
            setSaving(false)
            setTimeout(() => setMsg(null), 4000)
        }
    }

    const handleBillOCR = async (file: File) => {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            const formData = new FormData()
            formData.append('image', file)
            const res = await fetch('/api/ocr/bill', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: formData,
            })
            const data = await res.json()
            if (data.success) {
                if (data.units) setElecUnits(String(data.units))
                if (data.amount) setElecAmount(String(data.amount))
                setElecSource('bill_ocr')
                setMsg({ type: 'ok', text: `OCR detected: ${data.units} units, ₹${data.amount}` })
            } else {
                setMsg({ type: 'err', text: 'OCR failed — please enter manually' })
            }
        } catch { setMsg({ type: 'err', text: 'OCR request failed' }) }
        setTimeout(() => setMsg(null), 5000)
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">⚡ Utility Configuration</div>
                <div className="page-subtitle">Set electricity rate, water, and WiFi charges per month</div>
            </div>

            {/* Month selector */}
            <div className="g2 mb4" style={{ maxWidth: 360 }}>
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

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            <div className="g2 mb4">
                {/* Electricity */}
                <div className="card">
                    <div className="card-title">⚡ Electricity Rate</div>

                    {/* OCR Upload */}
                    <input type="file" accept="image/*" id="bill-ocr" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.[0]) handleBillOCR(e.target.files[0]) }} />
                    <div className="drop mb4" onClick={() => document.getElementById('bill-ocr')?.click()}>
                        <div className="drop-icon">📸</div>
                        <div className="drop-text">Upload Mahavitaran Bill (OCR)</div>
                        <div className="drop-sub">Auto-detect units and amount</div>
                    </div>

                    <div className="fg">
                        <label className="fl">Total Units (kWh)</label>
                        <input className="fi" type="number" value={elecUnits} onChange={e => setElecUnits(e.target.value)} placeholder="e.g. 450" />
                    </div>
                    <div className="fg">
                        <label className="fl">Total Amount (₹)</label>
                        <input className="fi" type="number" value={elecAmount} onChange={e => setElecAmount(e.target.value)} placeholder="e.g. 2700" />
                    </div>
                    <div className="card-inner" style={{ textAlign: 'center' }}>
                        <div className="small muted mb1">Per-Unit Rate</div>
                        <div className="mono bold" style={{ fontSize: '1.5rem', color: '#f59e0b' }}>₹{perUnitRate}</div>
                    </div>
                </div>

                {/* Water & WiFi */}
                <div className="card">
                    <div className="card-title">💧 Water & 📶 WiFi</div>
                    <div className="fg">
                        <label className="fl">💧 Water charge per tenant (₹)</label>
                        <input className="fi" type="number" value={waterCharge} onChange={e => setWaterCharge(e.target.value)} />
                    </div>
                    <div className="fg">
                        <label className="fl">📶 WiFi charge per tenant (₹)</label>
                        <input className="fi" type="number" value={wifiCharge} onChange={e => setWifiCharge(e.target.value)} />
                    </div>
                    <div className="alert a-info" style={{ fontSize: '0.75rem' }}>
                        Water applies to all tenants. WiFi only applies to tenants who opted in.
                    </div>
                </div>
            </div>

            <button className="btn btn-amber" onClick={handleSave} disabled={saving}>
                {saving ? <><Spinner /> Saving...</> : `💾 Save for ${fmtM(selM, selY)}`}
            </button>

            {/* History */}
            {configs.length > 0 && (
                <div className="card mt4">
                    <div className="card-title">Rate History</div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr><th>Month</th><th>Rate/Unit</th><th>Units</th><th>Amount</th><th>Water</th><th>WiFi</th><th>Source</th></tr></thead>
                            <tbody>
                                {configs.map(c => (
                                    <tr key={c.id}>
                                        <td className="bold">{fmtM(c.month, c.year)}</td>
                                        <td className="mono amber">₹{c.electricity_per_unit_rate ? Number(c.electricity_per_unit_rate).toFixed(4) : '—'}</td>
                                        <td className="mono">{c.electricity_total_units ?? '—'}</td>
                                        <td className="mono">{c.electricity_total_amount ? fmtINR(Number(c.electricity_total_amount)) : '—'}</td>
                                        <td className="mono">{fmtINR(Number(c.water_charge_per_tenant))}</td>
                                        <td className="mono">{fmtINR(Number(c.wifi_charge_per_tenant))}</td>
                                        <td><span className={`badge ${c.electricity_source === 'bill_ocr' ? 'b-info' : 'b-draft'}`}>{c.electricity_source === 'bill_ocr' ? '🤖 OCR' : '✏️ Manual'}</span></td>
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
