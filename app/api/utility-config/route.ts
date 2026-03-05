import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data, error } = await supabaseAdmin
            .from('utility_config')
            .select('*')
            .order('year', { ascending: false })
            .order('month', { ascending: false })

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch configs'
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
        const { month, year } = body

        if (!month || !year) {
            return NextResponse.json({ error: 'Month and year required' }, { status: 400 })
        }

        const upsertData = {
            month: Number(month),
            year: Number(year),
            electricity_per_unit_rate: body.electricity_per_unit_rate != null ? Number(body.electricity_per_unit_rate) : null,
            electricity_total_units: body.electricity_total_units != null ? Number(body.electricity_total_units) : null,
            electricity_total_amount: body.electricity_total_amount != null ? Number(body.electricity_total_amount) : null,
            electricity_source: body.electricity_source || null,
            electricity_bill_image_url: body.electricity_bill_image_url || null,
            water_charge_per_tenant: Number(body.water_charge_per_tenant ?? 200),
            wifi_charge_per_tenant: Number(body.wifi_charge_per_tenant ?? 500),
            set_by: user.id,
        }

        const { data, error } = await supabaseAdmin
            .from('utility_config')
            .upsert(upsertData, { onConflict: 'month,year' })
            .select()
            .single()

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to save config'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
