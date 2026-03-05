import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

        const { data, error } = await supabaseAdmin
            .from('tenants')
            .select('*, profiles(*)')
            .order('created_at', { ascending: true })

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch tenants'
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

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

        const body = await req.json()
        const { name, username, password, phone, flat, rent_amount, rent_due_day, wifi_opted_in,
            move_in_date, lease_start_date, lease_end_date, security_deposit_amount, security_deposit_date } = body

        if (!name || !username || !password || !flat) {
            return NextResponse.json({ error: 'Name, username, password, and flat are required' }, { status: 400 })
        }

        // Generate proxy email
        const email = `${username.trim().toLowerCase()}@hx.com`

        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email, password, email_confirm: true,
        })
        if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

        const userId = authData.user.id

        // Create profile
        await supabaseAdmin.from('profiles').insert({
            id: userId, name, email, phone: phone || '', role: 'tenant',
        })

        // Create tenant
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .insert({
                id: userId, flat,
                rent_amount: rent_amount || 0,
                rent_due_day: rent_due_day || 5,
                wifi_opted_in: wifi_opted_in || false,
                move_in_date: move_in_date || null,
                lease_start_date: lease_start_date || null,
                lease_end_date: lease_end_date || null,
                security_deposit_amount: security_deposit_amount || 0,
                security_deposit_date: security_deposit_date || null,
            })
            .select('*, profiles(*)')
            .single()

        if (tenantError) throw tenantError
        return NextResponse.json(tenant)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create tenant'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
