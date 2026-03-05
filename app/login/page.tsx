'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Spinner from '@/components/Spinner'

export default function LoginPage() {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Login failed')

            // Store session in browser Supabase client
            const { supabase } = await import('@/lib/supabase')
            await supabase.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
            })

            // Route based on role
            if (data.profile.role === 'admin') {
                router.push('/admin/overview')
            } else {
                router.push('/tenant/statement')
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-wrap">
            <div className="login-box">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: 14,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem', marginBottom: '1rem',
                    }}>⚡</div>
                    <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.25rem' }}>HX</h1>
                    <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Tenant Management System</p>
                </div>

                {error && <div className="alert a-err mb4">{error}</div>}

                <form onSubmit={handleLogin}>
                    <div className="fg">
                        <label className="fl">Username</label>
                        <input
                            className="fi"
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="admin or flat101"
                            required
                        />
                    </div>
                    <div className="fg">
                        <label className="fl">Password</label>
                        <input
                            className="fi"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button
                        className="btn btn-amber btn-full"
                        type="submit"
                        disabled={loading}
                        style={{ padding: '0.75rem', marginTop: '0.5rem' }}
                    >
                        {loading ? <><Spinner /> Signing in...</> : 'Sign In'}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.72rem', color: '#475569' }}>
                    Powered by HX v1.0
                </div>
            </div>
        </div>
    )
}
