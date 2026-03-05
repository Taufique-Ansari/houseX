import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
    try {
        const { data, error } = await supabaseAdmin
            .from('electricity_rates')
            .select('*')
            .order('year', { ascending: false })
            .order('month', { ascending: false })

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch rates'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const client = createServerClient(token)

        // Verify admin role
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 })
        }

        const body = await req.json()
        const { month, year, total_units, total_amount, source, bill_image_url } = body

        if (!month || !year || !total_units || !total_amount) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Upsert: delete existing then insert
        await supabaseAdmin
            .from('electricity_rates')
            .delete()
            .eq('month', month)
            .eq('year', year)

        const { data, error } = await supabaseAdmin
            .from('electricity_rates')
            .insert({
                month,
                year,
                total_units,
                total_amount,
                source: source || 'manual',
                bill_image_url: bill_image_url || null,
                set_by: user.id,
            })
            .select()
            .single()

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to save rate'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
