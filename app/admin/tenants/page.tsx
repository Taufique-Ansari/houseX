'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtDate } from '@/lib/utils'
import type { Tenant } from '@/lib/types'

export default function TenantsPage() {
    const router = useRouter()
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loaded, setLoaded] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Add modal
    const [showAdd, setShowAdd] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({
        name: '', username: '', password: '', phone: '', flat: '',
        rent_amount: '8000', rent_due_day: '5', wifi_opted_in: false,
        move_in_date: '', lease_start_date: '', lease_end_date: '',
        security_deposit_amount: '0', security_deposit_date: '',
    })

    // Delete modal
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null)
    const [deleting, setDeleting] = useState(false)

    const getHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return { Authorization: `Bearer ${session?.access_token}` }
    }

    const loadData = useCallback(async () => {
        const headers = await getHeaders()
        const res = await fetch('/api/tenants', { headers })
        const data = await res.json()
        setTenants(Array.isArray(data) ? data : [])
        setLoaded(true)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    const handleAdd = async () => {
        if (!form.name || !form.username || !form.password || !form.flat) {
            setMsg({ type: 'err', text: 'Name, username, password, and flat are required' }); return
        }
        setSaving(true); setMsg(null)
        try {
            const headers = { ...(await getHeaders()), 'Content-Type': 'application/json' }
            const res = await fetch('/api/tenants', {
                method: 'POST', headers,
                body: JSON.stringify({
                    ...form,
                    rent_amount: Number(form.rent_amount),
                    rent_due_day: Number(form.rent_due_day),
                    security_deposit_amount: Number(form.security_deposit_amount),
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setShowAdd(false)
            setForm({ name: '', username: '', password: '', phone: '', flat: '', rent_amount: '8000', rent_due_day: '5', wifi_opted_in: false, move_in_date: '', lease_start_date: '', lease_end_date: '', security_deposit_amount: '0', security_deposit_date: '' })
            await loadData()
            setMsg({ type: 'ok', text: `Tenant ${data.profiles?.name || form.name} added ✓` })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setSaving(false)
            setTimeout(() => setMsg(null), 5000)
        }
    }

    const confirmDelete = async () => {
        if (!deleteConfirm) return
        setDeleting(true)
        try {
            const headers = await getHeaders()
            const res = await fetch(`/api/tenants/${deleteConfirm.id}`, { method: 'DELETE', headers })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
            await loadData()
            setMsg({ type: 'ok', text: `Tenant deleted ✓` })
            setDeleteConfirm(null)
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally {
            setDeleting(false)
            setTimeout(() => setMsg(null), 4000)
        }
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>

    return (
        <div className="page">
            <div className="page-header">
                <div className="row between wrap">
                    <div>
                        <div className="page-title">👥 Tenants</div>
                        <div className="page-subtitle">{tenants.filter(t => t.is_active).length} active tenants</div>
                    </div>
                    <button className="btn btn-amber" onClick={() => setShowAdd(true)}>➕ Add Tenant</button>
                </div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            <div className="g2">
                {tenants.map(t => (
                    <div className="tenant-card" key={t.id}>
                        <div className="row between mb3">
                            <div className="row">
                                <div style={{
                                    width: 42, height: 42, borderRadius: '50%',
                                    background: t.is_active ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#374151',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1.1rem', fontWeight: 700, color: '#0f172a',
                                }}>{t.profiles?.name?.charAt(0) || '?'}</div>
                                <div>
                                    <div className="bold" style={{ color: '#f8fafc', fontSize: '0.95rem' }}>{t.profiles?.name}</div>
                                    <div className="small muted">{t.flat} • {t.profiles?.email?.replace('@hx.com', '')}</div>
                                </div>
                            </div>
                            <span className={`badge ${t.is_active ? 'b-paid' : 'b-draft'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                        <div className="g3 mb3" style={{ fontSize: '0.78rem' }}>
                            <div><div className="muted mb1">Rent</div><div className="mono bold amber">{fmtINR(Number(t.rent_amount))}</div></div>
                            <div><div className="muted mb1">WiFi</div><div className="mono bold">{t.wifi_opted_in ? '✓ Yes' : '✗ No'}</div></div>
                            <div><div className="muted mb1">Since</div><div className="mono">{t.move_in_date ? fmtDate(t.move_in_date) : '—'}</div></div>
                        </div>
                        <div className="row" style={{ gap: '0.375rem' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/admin/tenants/${t.id}`)}>👁 View</button>
                            <button className="btn btn-red btn-sm" onClick={() => setDeleteConfirm({ id: t.id, name: t.profiles?.name || 'Unknown' })}>🗑</button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Tenant Modal */}
            {showAdd && (
                <div className="overlay" onClick={() => setShowAdd(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <div className="modal-hd">
                            <h2>Add New Tenant</h2>
                            <button className="close-btn" onClick={() => setShowAdd(false)}>×</button>
                        </div>
                        <div className="g2">
                            <div className="fg"><label className="fl">Name *</label><input className="fi" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                            <div className="fg"><label className="fl">Flat *</label><input className="fi" value={form.flat} onChange={e => setForm({ ...form, flat: e.target.value })} placeholder="e.g. Flat 103" /></div>
                        </div>
                        <div className="g2">
                            <div className="fg"><label className="fl">Username *</label><input className="fi" type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
                            <div className="fg"><label className="fl">Password *</label><input className="fi" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
                        </div>
                        <div className="g2">
                            <div className="fg"><label className="fl">Phone</label><input className="fi" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                            <div className="fg"><label className="fl">Rent (₹)</label><input className="fi" type="number" value={form.rent_amount} onChange={e => setForm({ ...form, rent_amount: e.target.value })} /></div>
                        </div>
                        <div className="g2">
                            <div className="fg"><label className="fl">Due Day</label><input className="fi" type="number" min="1" max="28" value={form.rent_due_day} onChange={e => setForm({ ...form, rent_due_day: e.target.value })} /></div>
                            <div className="fg"><label className="fl" style={{ cursor: 'pointer' }}>WiFi</label><label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', padding: '0.6rem 0' }}><input type="checkbox" checked={form.wifi_opted_in} onChange={e => setForm({ ...form, wifi_opted_in: e.target.checked })} /> Opted in</label></div>
                        </div>
                        <div className="g2">
                            <div className="fg"><label className="fl">Move-in Date</label><input className="fi" type="date" value={form.move_in_date} onChange={e => setForm({ ...form, move_in_date: e.target.value })} /></div>
                            <div className="fg"><label className="fl">Security Deposit (₹)</label><input className="fi" type="number" value={form.security_deposit_amount} onChange={e => setForm({ ...form, security_deposit_amount: e.target.value })} /></div>
                        </div>
                        <div className="g2">
                            <div className="fg"><label className="fl">Lease Start</label><input className="fi" type="date" value={form.lease_start_date} onChange={e => setForm({ ...form, lease_start_date: e.target.value })} /></div>
                            <div className="fg"><label className="fl">Lease End</label><input className="fi" type="date" value={form.lease_end_date} onChange={e => setForm({ ...form, lease_end_date: e.target.value })} /></div>
                        </div>
                        <button className="btn btn-amber btn-full mt2" onClick={handleAdd} disabled={saving}>
                            {saving ? <><Spinner /> Creating...</> : '✓ Add Tenant'}
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                        <div className="modal-hd">
                            <h2>Delete Tenant</h2>
                            <button className="close-btn" onClick={() => !deleting && setDeleteConfirm(null)} disabled={deleting}>×</button>
                        </div>
                        <div className="mb4" style={{ lineHeight: 1.5 }}>
                            Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
                            <br /><br />
                            <span className="red">This action is permanent and will delete all associated statements, payments, readings, and ledger history.</span>
                        </div>
                        <div className="row" style={{ gap: '1rem' }}>
                            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</button>
                            <button className="btn btn-red" style={{ flex: 1 }} onClick={confirmDelete} disabled={deleting}>
                                {deleting ? <Spinner /> : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
