import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Verify admin
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 })
        }

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('role', 'tenant')
            .order('created_at', { ascending: true })

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch users'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Verify admin
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 })
        }

        const { name, username, email, password, flat } = await req.json()

        if (!name || !username || !email || !password) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email, password, email_confirm: true,
        })

        if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 400 })
        }

        // Insert profile
        const { data: newProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id: authData.user.id,
                name,
                username,
                role: 'tenant',
                flat: flat || '',
            })
            .select()
            .single()

        if (profileError) throw profileError
        return NextResponse.json(newProfile)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create user'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
