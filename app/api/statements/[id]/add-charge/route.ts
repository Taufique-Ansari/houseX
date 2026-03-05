import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

        const { description, amount } = await req.json()
        if (!description || !amount) return NextResponse.json({ error: 'Description and amount required' }, { status: 400 })

        // Get current statement
        const { data: stmt } = await supabaseAdmin.from('statements').select('one_time_charges, tenant_id').eq('id', id).single()
        if (!stmt) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })

        const charges = [...(stmt.one_time_charges || []), { description, amount: Number(amount), added_by: user.id, added_at: new Date().toISOString() }]

        const { data, error } = await supabaseAdmin
            .from('statements')
            .update({ one_time_charges: charges })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        // Add ledger entry
        await supabaseAdmin.from('ledger_entries').insert({
            tenant_id: stmt.tenant_id, statement_id: id,
            type: 'charge', description: `One-time: ${description}`, amount: Number(amount), created_by: user.id,
        })

        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to add charge'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
