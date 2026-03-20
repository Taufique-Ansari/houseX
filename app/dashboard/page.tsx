'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import OverviewTab from '@/components/admin/OverviewTab'
import RateTab from '@/components/admin/RateTab'
import ReadingsTab from '@/components/admin/ReadingsTab'
import AdminBillsTab from '@/components/admin/AdminBillsTab'
import Modal from '@/components/Modal'
import MeterInput from '@/components/MeterInput'
import { fmtINR, fmtM, MONTHS, CUR_M, CUR_Y } from '@/lib/utils'
import type { Profile, ElectricityRate, MeterReading, Bill } from '@/lib/types'

/* ═══════════════════ TENANT APP ═══════════════════ */
function TenantApp({ user, profile, token, onLogout }: {
    user: { id: string }
    profile: Profile
    token: string
    onLogout: () => void
}) {
    const [tab, setTab] = useState('bill')
    const [readings, setReadings] = useState<MeterReading[]>([])
    const [bills, setBills] = useState<Bill[]>([])
    const [loaded, setLoaded] = useState(false)
    const [selM, setSelM] = useState(CUR_M)
    const [selY, setSelY] = useState(CUR_Y)
    const [readingMsg, setReadingMsg] = useState<{ type: string; text: string } | null>(null)
    const [payModal, setPayModal] = useState<string | null>(null)
    const [payFile, setPayFile] = useState<File | null>(null)
    const [payLoading, setPayLoading] = useState(false)
    const [payMsg, setPayMsg] = useState<{ type: string; text: string } | null>(null)
    const [editReadingId, setEditReadingId] = useState<string | null>(null)
    const [editReadingVal, setEditReadingVal] = useState('')
    const [editReadingLoading, setEditReadingLoading] = useState(false)

    const loadData = useCallback(async () => {
        try {
            const headers = { Authorization: `Bearer ${token}` }
            const [readingsRes, billsRes] = await Promise.all([
                fetch('/api/readings', { headers }),
                fetch('/api/bills', { headers }),
            ])
            const readingsData = await readingsRes.json()
            const billsData = await billsRes.json()
            setReadings(Array.isArray(readingsData) ? readingsData : [])
            setBills(Array.isArray(billsData) ? billsData : [])
        } catch (err) {
            console.error('Failed to load data:', err)
        } finally {
            setLoaded(true)
        }
    }, [token])

    useEffect(() => { loadData() }, [loadData])

    const saveReading = async (val: number) => {
        try {
            const res = await fetch('/api/readings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    user_id: user.id,
                    month: selM,
                    year: selY,
                    reading_value: val,
                    source: 'manual',
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            await loadData()
            setReadingMsg({ type: 'ok', text: `Reading ${val} submitted for ${fmtM(selM, selY)} ✓` })
            setTimeout(() => setReadingMsg(null), 4000)
            setTab('history')
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save reading'
            setReadingMsg({ type: 'err', text: message })
        }
    }

    const markPaid = async (billId: string) => {
        if (!payFile) return
        setPayLoading(true)
        try {
            const formData = new FormData()
            formData.append('payment_proof', payFile)

            const res = await fetch(`/api/bills/${billId}/pay`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            await loadData()
            setPayModal(null)
            setPayFile(null)
            setPayMsg({ type: 'ok', text: 'Payment recorded successfully!' })
            setTimeout(() => setPayMsg(null), 3500)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to record payment'
            setPayMsg({ type: 'err', text: message })
        } finally {
            setPayLoading(false)
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
            await loadData()
            setReadingMsg({ type: 'ok', text: 'Reading deleted' })
            setTimeout(() => setReadingMsg(null), 3500)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to delete'
            setReadingMsg({ type: 'err', text: message })
        }
    }

    const modifyReading = async () => {
        if (!editReadingId || !editReadingVal || isNaN(Number(editReadingVal))) return
        setEditReadingLoading(true)
        try {
            const res = await fetch(`/api/readings/${editReadingId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ reading_value: Number(editReadingVal) }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            await loadData()
            setEditReadingId(null)
            setEditReadingVal('')
            setReadingMsg({ type: 'ok', text: 'Reading updated' })
            setTimeout(() => setReadingMsg(null), 3500)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to update'
            setReadingMsg({ type: 'err', text: message })
        } finally {
            setEditReadingLoading(false)
        }
    }

    const TABS = [
        { id: 'bill', label: '🧾 My Bill' },
        { id: 'reading', label: '📟 Submit Reading' },
        { id: 'history', label: '📚 History' }
    ]

    const currentBill = bills.find(b => b.month === CUR_M && b.year === CUR_Y)
    const pendingBills = bills.filter(b => b.status === 'pending')
    const totalDue = pendingBills.reduce((s, b) => s + b.amount, 0)

    if (!loaded) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090e1a' }}>
            <div style={{ color: '#64748b' }}><Spinner /> Loading...</div>
        </div>
    )

    return (
        <div style={{ minHeight: '100vh', background: '#090e1a' }}>
            <nav className="nav">
                <div className="nav-brand">
                    <div className="nav-icon">⚡</div>
                    <div>
                        <div className="nav-title">VoltTrack</div>
                        <div className="nav-meta">{(profile as any).flat}</div>
                    </div>
                </div>
                <div className="row">
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{profile.name}</span>
                    <button className="nav-logout" onClick={onLogout}>Logout</button>
                </div>
            </nav>
            <div className="tabs">
                {TABS.map(t => <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>)}
            </div>

            {/* MY BILL */}
            {tab === 'bill' && (
                <div className="page">
                    {payMsg && <div className={`alert ${payMsg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{payMsg.text}</div>}

                    <div className="card mb4">
                        <div className="card-title">{fmtM(CUR_M, CUR_Y)} — Current Bill</div>
                        {currentBill ? (
                            <>
                                <div className="row between mb4">
                                    <div>
                                        <div className="small muted mb1">Amount Due</div>
                                        <div style={{ fontSize: '2.75rem', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: '#f59e0b', lineHeight: 1 }}>
                                            {fmtINR(currentBill.amount)}
                                        </div>
                                    </div>
                                    <span className={`badge ${currentBill.status === 'paid' ? 'b-paid' : 'b-pending'}`} style={{ fontSize: '0.78rem', padding: '0.4rem 0.875rem' }}>
                                        {currentBill.status === 'paid' ? '✓ PAID' : '⏳ PENDING'}
                                    </span>
                                </div>
                                <div className="g2 mb4">
                                    {[
                                        ['Units Used', `${currentBill.units_used} kWh`],
                                        ['Rate', `₹${currentBill.per_unit_rate.toFixed(4)}/unit`],
                                        ['Prev Reading', String(currentBill.prev_reading)],
                                        ['Curr Reading', String(currentBill.curr_reading)]
                                    ].map(([k, v]) => (
                                        <div className="card-inner" key={k}>
                                            <div className="small muted mb1">{k}</div>
                                            <div className="mono bold" style={{ color: '#f8fafc' }}>{v}</div>
                                        </div>
                                    ))}
                                </div>
                                {currentBill.status === 'pending' && (
                                    <button className="btn btn-green" onClick={() => setPayModal(currentBill.id)}>💳 Mark as Paid</button>
                                )}
                                {currentBill.status === 'paid' && currentBill.payment_proof_url && (
                                    <div className="mt3">
                                        <div className="small muted mb2">Payment Proof Uploaded</div>
                                        <img src={currentBill.payment_proof_url} style={{ maxWidth: '220px', borderRadius: '8px', border: '1px solid #2d3748' }} alt="Payment Proof" />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="empty" style={{ padding: '2rem 1rem' }}>
                                <div className="empty-icon">🔍</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Bill for {fmtM(CUR_M, CUR_Y)} not yet generated by admin</div>
                            </div>
                        )}
                    </div>

                    {pendingBills.length > 0 && (
                        <div className="card">
                            <div className="card-title">Outstanding Dues</div>
                            {pendingBills.map(b => (
                                <div key={b.id} className="card-inner mb3">
                                    <div className="row between">
                                        <div>
                                            <div className="bold" style={{ color: '#f8fafc' }}>{fmtM(b.month, b.year)}</div>
                                            <div className="small muted">{b.units_used} units · generated {new Date(b.generated_at).toLocaleDateString('en-IN')}</div>
                                        </div>
                                        <div className="row" style={{ gap: '0.5rem' }}>
                                            <span className="mono amber bold">{fmtINR(b.amount)}</span>
                                            <button className="btn btn-green btn-sm" onClick={() => setPayModal(b.id)}>Pay</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="div" />
                            <div className="row between">
                                <span className="bold" style={{ color: '#f8fafc' }}>Total Outstanding</span>
                                <span className="mono amber bold" style={{ fontSize: '1.1rem' }}>{fmtINR(totalDue)}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* SUBMIT READING */}
            {tab === 'reading' && (
                <div className="page">
                    <div className="card" style={{ maxWidth: 540 }}>
                        <div className="card-title">Submit Meter Reading</div>
                        <div className="g2 mb4">
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
                        {readingMsg && <div className={`alert ${readingMsg.type === 'ok' ? 'a-ok' : 'a-err'} mb4`}>{readingMsg.text}</div>}
                        {readings.find(r => r.month === selM && r.year === selY) && (
                            <div className="alert a-info mb4">
                                ℹ️ Reading already submitted for {fmtM(selM, selY)}: <strong className="mono">{readings.find(r => r.month === selM && r.year === selY)?.reading_value}</strong>. Submitting again will overwrite.
                            </div>
                        )}
                        <MeterInput onConfirm={saveReading} />
                    </div>
                </div>
            )}

            {/* HISTORY */}
            {tab === 'history' && (
                <div className="page">
                    <div className="card mb4">
                        <div className="card-title">Bill History</div>
                        {bills.length === 0
                            ? <div className="empty" style={{ padding: '2rem' }}><div className="empty-icon">🧾</div><div style={{ fontSize: '0.85rem' }}>No bills yet</div></div>
                            : <table className="tbl">
                                <thead><tr><th>Month</th><th>Units</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    {[...bills].sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()).map(b => (
                                        <tr key={b.id}>
                                            <td className="bold">{fmtM(b.month, b.year)}</td>
                                            <td className="mono">{b.units_used} kWh</td>
                                            <td className="mono amber bold">{fmtINR(b.amount)}</td>
                                            <td><span className={`badge ${b.status === 'paid' ? 'b-paid' : 'b-pending'}`}>{b.status === 'paid' ? '✓ Paid' : '⏳ Pending'}</span></td>
                                            <td>
                                                {b.status === 'pending'
                                                    ? <button className="btn btn-green btn-sm" onClick={() => setPayModal(b.id)}>Pay</button>
                                                    : <span className="green small">✓</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>}
                    </div>

                    <div className="card">
                        <div className="card-title">Reading History</div>
                        {readings.length === 0
                            ? <div className="empty" style={{ padding: '2rem' }}><div className="empty-icon">📟</div><div style={{ fontSize: '0.85rem' }}>No readings submitted yet</div></div>
                            : <table className="tbl">
                                <thead><tr><th>Month</th><th>Reading</th><th>Source</th><th>Date</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {[...readings].sort((a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()).map(r => (
                                        <tr key={r.id}>
                                            <td className="bold">{fmtM(r.month, r.year)}</td>
                                            <td className="mono amber">{r.reading_value}</td>
                                            <td><span className={`badge ${r.source === 'ocr' ? 'b-info' : 'b-warn'}`}>{r.source === 'ocr' ? '🤖 OCR' : '✏️ Manual'}</span></td>
                                            <td className="muted">{new Date(r.submitted_at || 0).toLocaleDateString('en-IN')}</td>
                                            <td>
                                                <div className="row" style={{ gap: '0.35rem' }}>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditReadingId(r.id); setEditReadingVal(String(r.reading_value)) }} title="Modify">✏️</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => deleteReading(r.id)} title="Delete" style={{ color: '#ef4444' }}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>}
                    </div>
                </div>
            )}

            {/* PAY MODAL */}
            <Modal open={!!payModal} onClose={() => { setPayModal(null); setPayFile(null) }} title="Mark Bill as Paid">
                <div className="alert a-info mb4">
                    Upload a screenshot of your payment. This will be visible to the admin as proof of payment.
                </div>
                <input type="file" accept="image/*" onChange={e => setPayFile(e.target.files?.[0] || null)} style={{ display: 'none' }} id="pay-file-input" />
                {!payFile
                    ? <div className="drop mb4" onClick={() => document.getElementById('pay-file-input')?.click()}>
                        <div className="drop-icon">📸</div>
                        <div className="drop-text">Upload payment screenshot</div>
                        <div className="drop-sub">UPI, NEFT, or any payment app screenshot</div>
                    </div>
                    : <div className="mb4">
                        <div className="alert a-ok mb2">✓ {payFile.name} selected</div>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPayFile(null)}>Change file</button>
                    </div>}
                <button className="btn btn-green btn-full" onClick={() => payModal && markPaid(payModal)} disabled={!payFile || payLoading}>
                    {payLoading ? <><Spinner /> Processing...</> : '✓ Confirm Payment'}
                </button>
            </Modal>

            {/* EDIT READING MODAL */}
            <Modal open={!!editReadingId} onClose={() => { setEditReadingId(null); setEditReadingVal('') }} title="Modify Reading">
                <div className="fg">
                    <label className="fl">New Reading Value</label>
                    <input
                        className="fi"
                        type="number"
                        value={editReadingVal}
                        onChange={e => setEditReadingVal(e.target.value)}
                        placeholder="Enter new reading"
                        onKeyDown={e => e.key === 'Enter' && modifyReading()}
                    />
                </div>
                <button className="btn btn-amber btn-full" onClick={modifyReading} disabled={!editReadingVal || isNaN(Number(editReadingVal)) || editReadingLoading}>
                    {editReadingLoading ? <><Spinner /> Saving...</> : '💾 Save Changes'}
                </button>
            </Modal>
        </div>
    )
}

/* ═══════════════════ ADMIN APP ═══════════════════ */
function AdminApp({ profile, token, onLogout }: {
    profile: Profile
    token: string
    onLogout: () => void
}) {
    const [tab, setTab] = useState('overview')
    const [rates, setRates] = useState<ElectricityRate[]>([])
    const [readings, setReadings] = useState<MeterReading[]>([])
    const [bills, setBills] = useState<Bill[]>([])
    const [users, setUsers] = useState<Profile[]>([])
    const [loaded, setLoaded] = useState(false)

    const loadData = useCallback(async () => {
        try {
            const headers = { Authorization: `Bearer ${token}` }
            const [ratesRes, readingsRes, billsRes, usersRes] = await Promise.all([
                fetch('/api/rates', { headers }),
                fetch('/api/readings', { headers }),
                fetch('/api/bills', { headers }),
                fetch('/api/users', { headers }),
            ])
            const [ratesData, readingsData, billsData, usersData] = await Promise.all([
                ratesRes.json(), readingsRes.json(), billsRes.json(), usersRes.json(),
            ])
            setRates(Array.isArray(ratesData) ? ratesData : [])
            setReadings(Array.isArray(readingsData) ? readingsData : [])
            setBills(Array.isArray(billsData) ? billsData : [])
            setUsers(Array.isArray(usersData) ? usersData : [])
        } catch (err) {
            console.error('Failed to load data:', err)
        } finally {
            setLoaded(true)
        }
    }, [token])

    useEffect(() => { loadData() }, [loadData])

    const TABS = [
        { id: 'overview', label: '📊 Overview' },
        { id: 'rate', label: '⚡ Rate Setting' },
        { id: 'readings', label: '📟 Readings' },
        { id: 'bills', label: '🧾 All Bills' },
    ]

    if (!loaded) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090e1a' }}>
            <div style={{ color: '#64748b' }}><Spinner /> Loading...</div>
        </div>
    )

    return (
        <div style={{ minHeight: '100vh', background: '#090e1a' }}>
            <nav className="nav">
                <div className="nav-brand">
                    <div className="nav-icon">⚡</div>
                    <div>
                        <div className="nav-title">VoltTrack</div>
                        <div className="nav-meta">Admin Panel</div>
                    </div>
                </div>
                <div className="row">
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>👤 {profile.name}</span>
                    <button className="nav-logout" onClick={onLogout}>Logout</button>
                </div>
            </nav>
            <div className="tabs">
                {TABS.map(t => <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>)}
            </div>
            {tab === 'overview' && <OverviewTab bills={bills} rates={rates} readings={readings} users={users} />}
            {tab === 'rate' && <RateTab rates={rates} token={token} onRatesUpdated={loadData} />}
            {tab === 'readings' && <ReadingsTab readings={readings} bills={bills} rates={rates} users={users} token={token} onDataUpdated={loadData} />}
            {tab === 'bills' && <AdminBillsTab bills={bills} />}
        </div>
    )
}

/* ═══════════════════ DASHBOARD PAGE ═══════════════════ */
export default function DashboardPage() {
    const [profile, setProfile] = useState<Profile | null>(null)
    const [token, setToken] = useState<string>('')
    const [userId, setUserId] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        let mounted = true

        const checkSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) {
                    if (mounted) router.push('/login')
                    return
                }

                // Validate the session is still valid
                const { data: { user }, error: userError } = await supabase.auth.getUser()
                if (userError || !user) {
                    console.error('User validation failed:', userError)
                    if (mounted) router.push('/login')
                    return
                }

                if (mounted) {
                    setToken(session.access_token)
                    setUserId(user.id)
                }

                // Fetch profile via API route (bypasses RLS issues with anon key)
                const profileRes = await fetch('/api/auth/profile', {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                })
                const profileData = await profileRes.json()

                if (mounted) {
                    if (profileData && profileData.id) {
                        setProfile(profileData)
                    } else {
                        console.error('Profile not found:', profileData)
                        router.push('/login')
                    }
                    setLoading(false)
                }
            } catch (err) {
                console.error('Session check error:', err)
                if (mounted) {
                    router.push('/login')
                }
            }
        }

        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            // Only redirect on explicit sign-out, not during initial load
            if (event === 'SIGNED_OUT' && mounted) {
                router.push('/login')
            }
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [router])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    if (loading || !profile) {
        return (
            <div style={{ minHeight: '100vh', background: '#090e1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#64748b', fontFamily: "Sora, sans-serif" }}><Spinner /> Starting VoltTrack...</div>
            </div>
        )
    }

    if (profile.role === 'admin') {
        return <AdminApp profile={profile} token={token} onLogout={handleLogout} />
    }

    return <TenantApp user={{ id: userId }} profile={profile} token={token} onLogout={handleLogout} />
}
