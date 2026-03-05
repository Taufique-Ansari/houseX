'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const res = await fetch('/api/auth/profile', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const profile = await res.json()
      if (profile?.role === 'admin') {
        router.push('/admin/overview')
      } else {
        router.push('/tenant/statement')
      }
    }
    check()
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: '#090e1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Redirecting...</div>
    </div>
  )
}
