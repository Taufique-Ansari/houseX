import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: statement, error } = await supabaseAdmin
            .from('statements')
            .select('*, tenants(flat, profiles(name))')
            .eq('id', id)
            .single()

        if (error || !statement) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })

        // Verify access
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && statement.tenant_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Get payments
        const { data: payments } = await supabaseAdmin
            .from('payments').select('*').eq('statement_id', id).order('paid_at', { ascending: false })

        return NextResponse.json({ ...statement, payments: payments || [] })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch statement'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

        const body = await req.json()
        const updates: Record<string, unknown> = {}
        if (body.one_time_charges !== undefined) updates.one_time_charges = body.one_time_charges
        if (body.due_date !== undefined) updates.due_date = body.due_date

        const { data, error } = await supabaseAdmin
            .from('statements').update(updates).eq('id', id).select().single()
        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update statement'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

        // 1. Delete associated ledger entries (so foreign key constraint isn't violated)
        // Since statement ledger entries are created during statement generation, they should be cleaned up.
        await supabaseAdmin.from('ledger_entries').delete().eq('statement_id', id)

        // 2. Delete the statement itself
        const { error } = await supabaseAdmin.from('statements').delete().eq('id', id)
        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete statement'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
