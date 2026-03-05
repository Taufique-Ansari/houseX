'use client'

import { useState } from 'react'
import Spinner from '@/components/Spinner'
import Modal from '@/components/Modal'
import type { Profile } from '@/lib/utils'

interface UsersTabProps {
    users: Profile[]
    token: string
    onDataUpdated: () => void
}

export default function UsersTab({ users, token, onDataUpdated }: UsersTabProps) {
    const tenants = users.filter(u => u.role === 'tenant')
    const [showAdd, setShowAdd] = useState(false)
    const [editUser, setEditUser] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

    // Add user form
    const [addForm, setAddForm] = useState({ name: '', username: '', email: '', password: '', flat: '', phone: '' })
    // Edit form
    const [editForm, setEditForm] = useState({ name: '', flat: '', phone: '' })

    const showMsg = (type: string, text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000) }

    const addUser = async () => {
        if (!addForm.name || !addForm.username || !addForm.email || !addForm.password) {
            return showMsg('err', 'Name, username, email, and password are required')
        }
        setLoading(true)
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(addForm),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onDataUpdated()
            setShowAdd(false)
            setAddForm({ name: '', username: '', email: '', password: '', flat: '', phone: '' })
            showMsg('ok', `User "${data.name}" created successfully`)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to add user'
            showMsg('err', message)
        } finally {
            setLoading(false)
        }
    }

    const updateUser = async () => {
        if (!editUser) return
        setLoading(true)
        try {
            const res = await fetch('/api/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ id: editUser.id, ...editForm }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onDataUpdated()
            setEditUser(null)
            showMsg('ok', 'User updated successfully')
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to update user'
            showMsg('err', message)
        } finally {
            setLoading(false)
        }
    }

    const deleteUser = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"? This will also delete all their readings and bills.`)) return
        try {
            const res = await fetch(`/api/users?id=${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            onDataUpdated()
            showMsg('ok', `User "${name}" deleted`)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to delete user'
            showMsg('err', message)
        }
    }

    const openEdit = (u: Profile) => {
        setEditUser(u)
        setEditForm({ name: u.name, flat: u.flat || '', phone: u.phone || '' })
    }

    return (
        <div className="page">
            <div className="row between mb4 wrap" style={{ gap: '0.75rem' }}>
                <div>
                    <span className="bold" style={{ color: '#f8fafc' }}>Users</span>
                    <span className="small muted" style={{ marginLeft: '0.75rem' }}>{tenants.length} tenants</span>
                </div>
                <button className="btn btn-amber" onClick={() => setShowAdd(true)}>+ Add Tenant</button>
            </div>

            {msg && <div className={`alert ${msg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{msg.text}</div>}

            {tenants.length === 0
                ? <div className="empty card"><div className="empty-icon">👤</div><div style={{ fontSize: '0.85rem' }}>No tenants yet. Add your first tenant above.</div></div>
                : <div className="user-grid">
                    {tenants.map(u => (
                        <div key={u.id} className="card" style={{ position: 'relative' }}>
                            <div className="row between mb3">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        width: 42, height: 42, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.1rem', fontWeight: 700, color: '#0f172a',
                                    }}>
                                        {u.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="bold" style={{ color: '#f8fafc', fontSize: '1rem' }}>{u.name}</div>
                                        <div className="small muted">{u.username}</div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                                {u.flat && <div><span className="muted">🏠 Flat:</span> <span style={{ color: '#e2e8f0' }}>{u.flat}</span></div>}
                                {u.phone && <div><span className="muted">📞 Phone:</span> <span style={{ color: '#e2e8f0' }}>{u.phone}</span></div>}
                                <div><span className="muted">📅 Joined:</span> <span style={{ color: '#e2e8f0' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '—'}</span></div>
                            </div>
                            <div className="row" style={{ gap: '0.5rem' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✏️ Edit</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => deleteUser(u.id, u.name)} style={{ color: '#ef4444' }}>🗑️ Delete</button>
                            </div>
                        </div>
                    ))}
                </div>}

            {/* ADD USER MODAL */}
            <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Tenant">
                <div className="fg">
                    <label className="fl">Name *</label>
                    <input className="fi" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Rahul Sharma" />
                </div>
                <div className="fg">
                    <label className="fl">Username *</label>
                    <input className="fi" value={addForm.username} onChange={e => setAddForm({ ...addForm, username: e.target.value })} placeholder="e.g. rahul" />
                </div>
                <div className="fg">
                    <label className="fl">Email *</label>
                    <input className="fi" type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="e.g. rahul@example.com" />
                </div>
                <div className="fg">
                    <label className="fl">Password *</label>
                    <input className="fi" type="password" value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })} placeholder="Minimum 6 characters" />
                </div>
                <div className="g2">
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Flat / Unit</label>
                        <input className="fi" value={addForm.flat} onChange={e => setAddForm({ ...addForm, flat: e.target.value })} placeholder="e.g. Flat 103" />
                    </div>
                    <div className="fg" style={{ marginBottom: 0 }}>
                        <label className="fl">Phone</label>
                        <input className="fi" type="tel" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} placeholder="e.g. 9876543210" />
                    </div>
                </div>
                <button className="btn btn-amber btn-full mt3" onClick={addUser} disabled={loading}>
                    {loading ? <><Spinner /> Creating...</> : '+ Create Tenant'}
                </button>
            </Modal>

            {/* EDIT USER MODAL */}
            <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit — ${editUser?.name}`}>
                <div className="fg">
                    <label className="fl">Name</label>
                    <input className="fi" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="fg">
                    <label className="fl">Flat / Unit</label>
                    <input className="fi" value={editForm.flat} onChange={e => setEditForm({ ...editForm, flat: e.target.value })} />
                </div>
                <div className="fg">
                    <label className="fl">Phone</label>
                    <input className="fi" type="tel" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <button className="btn btn-amber btn-full" onClick={updateUser} disabled={loading}>
                    {loading ? <><Spinner /> Saving...</> : '💾 Save Changes'}
                </button>
            </Modal>
        </div>
    )
}
