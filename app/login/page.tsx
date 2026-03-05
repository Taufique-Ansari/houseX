'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [err, setErr] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const login = async () => {
        if (!email.trim() || !password) return
        setLoading(true)
        setErr('')

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            })

            if (error) {
                setErr(error.message)
            } else {
                router.push('/dashboard')
            }
        } catch {
            setErr('Login failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-wrap">
            <div className="login-box">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 64, height: 64,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        borderRadius: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '2rem', margin: '0 auto 1.25rem'
                    }}>⚡</div>
                    <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.03em' }}>VoltTrack</h1>
                    <p style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.25rem' }}>Electricity Bill Manager</p>
                </div>

                {err && <div className="alert a-err mb4">{err}</div>}
                <div className="fg">
                    <label className="fl">Email</label>
                    <input
                        className="fi"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="admin@volttrack.app"
                        type="email"
                    />
                </div>
                <div className="fg">
                    <label className="fl">Password</label>
                    <input
                        className="fi"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && login()}
                        placeholder="••••••••"
                    />
                </div>
                <button className="btn btn-amber btn-full" onClick={login} disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign In →'}
                </button>

                <div style={{
                    marginTop: '1.5rem', background: '#1c2536',
                    borderRadius: 12, padding: '1rem',
                    fontSize: '0.73rem', color: '#64748b', lineHeight: 2
                }}>
                    <div style={{ color: '#94a3b8', fontWeight: 700, marginBottom: '0.25rem' }}>Demo Credentials</div>
                    <div>🛡️ Admin: <span style={{ fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>admin@volttrack.app</span> / <span style={{ fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>Admin@123</span></div>
                    <div>🏠 Tenant 1: <span style={{ fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>tenant1@volttrack.app</span> / <span style={{ fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>Tenant@123</span></div>
                    <div>🏠 Tenant 2: <span style={{ fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>tenant2@volttrack.app</span> / <span style={{ fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>Tenant@123</span></div>
                </div>
            </div>
        </div>
    )
}
