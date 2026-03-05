import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

// DELETE a reading
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Get the reading to verify ownership
        const { data: reading } = await supabaseAdmin
            .from('meter_readings')
            .select('user_id')
            .eq('id', id)
            .single()

        if (!reading) {
            return NextResponse.json({ error: 'Reading not found' }, { status: 404 })
        }

        // Verify: either the reading owner or admin
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && reading.user_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { error } = await supabaseAdmin
            .from('meter_readings')
            .delete()
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete reading'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// PATCH (modify) a reading
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Get the reading to verify ownership
        const { data: reading } = await supabaseAdmin
            .from('meter_readings')
            .select('user_id')
            .eq('id', id)
            .single()

        if (!reading) {
            return NextResponse.json({ error: 'Reading not found' }, { status: 404 })
        }

        // Verify: either the reading owner or admin
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && reading.user_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { reading_value } = await req.json()
        if (reading_value === undefined || isNaN(Number(reading_value))) {
            return NextResponse.json({ error: 'Valid reading_value is required' }, { status: 400 })
        }

        const { data: updated, error } = await supabaseAdmin
            .from('meter_readings')
            .update({ reading_value: Number(reading_value) })
            .eq('id', id)
            .select('*, profiles(name, flat)')
            .single()

        if (error) throw error
        return NextResponse.json(updated)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update reading'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
