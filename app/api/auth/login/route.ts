import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json()
        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
        }

        // Format username to proxy email
        const email = `${username.trim().toLowerCase()}@hx.com`

        const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password })
        if (error) return NextResponse.json({ error: error.message }, { status: 401 })

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single()

        let tenant = null
        if (profile?.role === 'tenant') {
            const { data: tenantData } = await supabaseAdmin
                .from('tenants')
                .select('*')
                .eq('id', data.user.id)
                .single()
            tenant = tenantData
        }

        return NextResponse.json({
            user: data.user,
            session: data.session,
            profile,
            tenant,
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
