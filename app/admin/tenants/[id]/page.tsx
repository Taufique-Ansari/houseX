'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import Spinner from '@/components/Spinner'
import { fmtINR, fmtDate, fmtM } from '@/lib/utils'
import type { Tenant, RentRevision, LedgerEntry, TenantDocument } from '@/lib/types'

export default function TenantDetailPage() {
    const { id } = useParams() as { id: string }
    const router = useRouter()
    const [tenant, setTenant] = useState<Tenant & { rent_revisions?: RentRevision[] } | null>(null)
    const [ledger, setLedger] = useState<LedgerEntry[]>([])
    const [docs, setDocs] = useState<TenantDocument[]>([])
    const [loaded, setLoaded] = useState(false)
    const [tab, setTab] = useState<'profile' | 'ledger' | 'docs' | 'settlement'>('profile')
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Edit
    const [editing, setEditing] = useState(false)
    const [editForm, setEditForm] = useState<Record<string, string | boolean>>({})
    const [saving, setSaving] = useState(false)

    const getHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return { Authorization: `Bearer ${session?.access_token}` }
    }

    const loadData = useCallback(async () => {
        const headers = await getHeaders()
        const [tRes, lRes, dRes] = await Promise.all([
            fetch(`/api/tenants/${id}`, { headers }),
            fetch(`/api/tenants/${id}/ledger`, { headers }).catch(() => ({ json: async () => ([]) })),
            fetch(`/api/documents/${id}`, { headers }).catch(() => ({ json: async () => ([]) })),
        ])
        const tData = await tRes.json()
        setTenant(tData.error ? null : tData)
        setLedger(Array.isArray(await lRes.json()) ? await (await fetch(`/api/tenants/${id}/ledger`, { headers })).json() : [])
        setDocs(Array.isArray(await dRes.json()) ? await (await fetch(`/api/documents/${id}`, { headers })).json() : [])
        setLoaded(true)
    }, [id])

    useEffect(() => { loadData() }, [loadData])

    const startEdit = () => {
        if (!tenant) return
        setEditForm({
            name: tenant.profiles?.name || '',
            phone: tenant.profiles?.phone || '',
            flat: tenant.flat,
            rent_amount: String(tenant.rent_amount),
            rent_due_day: String(tenant.rent_due_day),
            wifi_opted_in: tenant.wifi_opted_in,
            notes: tenant.notes || '',
        })
        setEditing(true)
    }

    const saveEdit = async () => {
        setSaving(true)
        try {
            const headers = { ...(await getHeaders()), 'Content-Type': 'application/json' }
            const res = await fetch(`/api/tenants/${id}`, {
                method: 'PATCH', headers,
                body: JSON.stringify({
                    name: editForm.name,
                    phone: editForm.phone,
                    flat: editForm.flat,
                    rent_amount: Number(editForm.rent_amount),
                    rent_due_day: Number(editForm.rent_due_day),
                    wifi_opted_in: editForm.wifi_opted_in,
                    notes: editForm.notes,
                }),
            })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
            setEditing(false)
            await loadData()
            setMsg({ type: 'ok', text: 'Tenant updated ✓' })
        } catch (err: unknown) {
            setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed' })
        } finally { setSaving(false) }
        setTimeout(() => setMsg(null), 4000)
    }

    if (!loaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><Spinner /> Loading...</div>
    if (!tenant) return <div className="page"><div className="alert a-err">Tenant not found</div></div>

    const deposit = Number(tenant.security_deposit_amount || 0)

    const tabs = ['profile', 'ledger', 'docs', 'settlement'] as const
    const tabLabels = { profile: '👤 Profile', ledger: '📒 Ledger', docs: '📄 Documents', settlement: '🏦 Settlement' }

    return (
        <div className="page">
            <div className="page-header">
                <button className="btn btn-ghost btn-sm mb3" onClick={() => router.push('/admin/tenants')}>← Back to Tenants</button>
                <div className="row between wrap">
                    <div className="row">
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>{tenant.profiles?.name?.charAt(0) || '?'}</div>
                        <div>
                            <div className="page-title" style={{ margin: 0 }}>{tenant.profiles?.name}</div>
                            <div className="page-subtitle">{tenant.flat} • {tenant.profiles?.email}</div>
                        </div>
                    </div>
                    <span className={`badge ${tenant.is_active ? 'b-paid' : 'b-draft'}`}>{tenant.is_active ? 'Active' : 'Inactive'}</span>
                </div>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            {/* Tabs */}
            <div className="row mb4" style={{ gap: '0.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
                {tabs.map(t => (
                    <button key={t} className={`btn ${tab === t ? 'btn-amber' : 'btn-ghost'} btn-sm`} onClick={() => setTab(t)}>{tabLabels[t]}</button>
                ))}
            </div>

            {/* Profile Tab */}
            {tab === 'profile' && (
                <div className="card">
                    {!editing ? (
                        <>
                            <div className="row between mb4">
                                <div className="card-title" style={{ margin: 0 }}>Profile Details</div>
                                <button className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Edit</button>
                            </div>
                            <div className="g2 mb4" style={{ fontSize: '0.85rem' }}>
                                {[
                                    ['Name', tenant.profiles?.name],
                                    ['Email', tenant.profiles?.email],
                                    ['Phone', tenant.profiles?.phone || '—'],
                                    ['Flat', tenant.flat],
                                    ['Rent', fmtINR(Number(tenant.rent_amount))],
                                    ['Due Day', `${tenant.rent_due_day}th of month`],
                                    ['WiFi', tenant.wifi_opted_in ? '✓ Opted In' : '✗ Not Opted'],
                                    ['Move-in', tenant.move_in_date ? fmtDate(tenant.move_in_date) : '—'],
                                    ['Lease Start', tenant.lease_start_date ? fmtDate(tenant.lease_start_date) : '—'],
                                    ['Lease End', tenant.lease_end_date ? fmtDate(tenant.lease_end_date) : '—'],
                                    ['Security Deposit', fmtINR(deposit)],
                                    ['Notes', tenant.notes || '—'],
                                ].map(([label, value]) => (
                                    <div key={label} className="mb3">
                                        <div className="muted mb1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>{label}</div>
                                        <div className="bold">{value}</div>
                                    </div>
                                ))}
                            </div>
                            {/* Rent Revision History */}
                            {tenant.rent_revisions && tenant.rent_revisions.length > 0 && (
                                <>
                                    <div className="card-title">Rent Revision History</div>
                                    <div className="tbl-wrap">
                                        <table className="tbl">
                                            <thead><tr><th>Date</th><th>Old</th><th>New</th><th>Reason</th></tr></thead>
                                            <tbody>
                                                {tenant.rent_revisions.map(r => (
                                                    <tr key={r.id}>
                                                        <td>{fmtDate(r.effective_date)}</td>
                                                        <td className="mono">{fmtINR(Number(r.old_amount))}</td>
                                                        <td className="mono bold amber">{fmtINR(Number(r.new_amount))}</td>
                                                        <td className="small">{r.reason || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="card-title">Edit Tenant</div>
                            <div className="g2">
                                <div className="fg"><label className="fl">Name</label><input className="fi" value={editForm.name as string} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                                <div className="fg"><label className="fl">Phone</label><input className="fi" value={editForm.phone as string} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></div>
                            </div>
                            <div className="g2">
                                <div className="fg"><label className="fl">Flat</label><input className="fi" value={editForm.flat as string} onChange={e => setEditForm({ ...editForm, flat: e.target.value })} /></div>
                                <div className="fg"><label className="fl">Rent (₹)</label><input className="fi" type="number" value={editForm.rent_amount as string} onChange={e => setEditForm({ ...editForm, rent_amount: e.target.value })} /></div>
                            </div>
                            <div className="g2">
                                <div className="fg"><label className="fl">Due Day</label><input className="fi" type="number" min="1" max="28" value={editForm.rent_due_day as string} onChange={e => setEditForm({ ...editForm, rent_due_day: e.target.value })} /></div>
                                <div className="fg"><label className="fl">WiFi</label><label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0', fontSize: '0.82rem' }}><input type="checkbox" checked={editForm.wifi_opted_in as boolean} onChange={e => setEditForm({ ...editForm, wifi_opted_in: e.target.checked })} /> Opted In</label></div>
                            </div>
                            <div className="fg"><label className="fl">Notes</label><textarea className="fi" rows={3} value={editForm.notes as string} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
                            <div className="row" style={{ gap: '0.5rem' }}>
                                <button className="btn btn-amber" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : '✓ Save'}</button>
                                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Ledger Tab */}
            {tab === 'ledger' && (
                <div className="card">
                    <div className="card-title">Ledger</div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead>
                            <tbody>
                                {ledger.length === 0 ? (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>No entries yet</td></tr>
                                ) : ledger.map(e => (
                                    <tr key={e.id}>
                                        <td className="small">{fmtDate(e.created_at || '')}</td>
                                        <td><span className={`badge ${e.type === 'charge' ? 'b-overdue' : e.type === 'payment' ? 'b-paid' : e.type === 'credit' ? 'b-published' : 'b-partial'}`}>{e.type}</span></td>
                                        <td>{e.description}</td>
                                        <td className={`mono bold ${Number(e.amount) < 0 ? 'green' : 'red'}`}>{Number(e.amount) < 0 ? '-' : '+'}{fmtINR(Math.abs(Number(e.amount)))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Documents Tab */}
            {tab === 'docs' && (
                <div className="card">
                    <div className="card-title">Documents</div>
                    {docs.length === 0 ? (
                        <div className="empty"><div className="empty-icon">📁</div><div>No documents uploaded yet</div></div>
                    ) : (
                        <div className="tbl-wrap">
                            <table className="tbl">
                                <thead><tr><th>Type</th><th>Label</th><th>Uploaded</th><th>Action</th></tr></thead>
                                <tbody>
                                    {docs.map(d => (
                                        <tr key={d.id}>
                                            <td><span className="badge b-info">{d.type.replaceAll('_', ' ')}</span></td>
                                            <td>{d.label}</td>
                                            <td className="small">{fmtDate(d.uploaded_at || '')}</td>
                                            <td><a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: '#f59e0b', fontSize: '0.8rem' }}>📥 Download</a></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Settlement Tab */}
            {tab === 'settlement' && (
                <div className="card">
                    <div className="card-title">Settlement Preview</div>
                    <div className="card-inner" style={{ fontSize: '0.88rem' }}>
                        <div className="row between mb3"><span>Security Deposit</span><span className="mono bold green">{fmtINR(deposit)}</span></div>
                        <div className="div" />
                        <div className="row between"><span className="bold">Estimated Refund</span><span className="mono bold amber" style={{ fontSize: '1.15rem' }}>{fmtINR(deposit)}</span></div>
                        <div className="small muted mt3">Note: Outstanding balances from pending statements will be deducted from the refund amount.</div>
                    </div>
                </div>
            )}
        </div>
    )
}
