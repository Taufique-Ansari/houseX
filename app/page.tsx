'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      } else {
        router.push('/login')
      }
    }
    checkSession()
  }, [router])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#090e1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ color: '#64748b', fontFamily: "Sora, sans-serif" }}>
        <Spinner /> Starting VoltTrack...
      </div>
    </div>
  )
}
