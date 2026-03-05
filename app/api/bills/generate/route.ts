import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtM = (m: number, y: number) => `${MONTHS[m - 1]} ${y}`

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

        const { user_id, month, year } = await req.json()

        if (!user_id || !month || !year) {
            return NextResponse.json({ error: 'Missing required fields: user_id, month, year' }, { status: 400 })
        }

        // 1. Find electricity rate for this month/year
        const { data: rate, error: rateErr } = await supabaseAdmin
            .from('electricity_rates')
            .select('per_unit_rate')
            .eq('month', Number(month))
            .eq('year', Number(year))
            .single()

        if (rateErr || !rate) {
            return NextResponse.json(
                { error: `No rate set for ${fmtM(month, year)}. Please set the per-unit rate first in the Rate Setting tab.` },
                { status: 400 }
            )
        }

        // 2. Find previous month reading (REQUIRED to calculate units consumed)
        const [prevMonth, prevYear] = month === 1 ? [12, year - 1] : [month - 1, year]

        const { data: prevReading } = await supabaseAdmin
            .from('meter_readings')
            .select('reading_value')
            .eq('user_id', user_id)
            .eq('month', prevMonth)
            .eq('year', prevYear)
            .single()

        if (!prevReading) {
            return NextResponse.json(
                { error: `Previous month reading for ${fmtM(prevMonth, prevYear)} not found. To generate a bill for ${fmtM(month, year)}, you need BOTH the previous month reading and the current month reading so we can calculate units consumed (current − previous).` },
                { status: 400 }
            )
        }

        // 3. Find current month reading
        const { data: currReading } = await supabaseAdmin
            .from('meter_readings')
            .select('reading_value')
            .eq('user_id', user_id)
            .eq('month', Number(month))
            .eq('year', Number(year))
            .single()

        if (!currReading) {
            return NextResponse.json(
                { error: `No reading found for ${fmtM(month, year)}. Please add the current month's meter reading first.` },
                { status: 400 }
            )
        }

        // 4. Validate: current reading must be >= previous reading
        if (currReading.reading_value < prevReading.reading_value) {
            return NextResponse.json(
                { error: `Current reading (${currReading.reading_value}) cannot be less than previous reading (${prevReading.reading_value}). Please verify the meter readings.` },
                { status: 400 }
            )
        }

        // 5. Upsert bill (delete existing, then insert)
        await supabaseAdmin
            .from('bills')
            .delete()
            .eq('user_id', user_id)
            .eq('month', Number(month))
            .eq('year', Number(year))

        const { data: bill, error: billErr } = await supabaseAdmin
            .from('bills')
            .insert({
                user_id,
                month: Number(month),
                year: Number(year),
                prev_reading: prevReading.reading_value,
                curr_reading: currReading.reading_value,
                per_unit_rate: rate.per_unit_rate,
                status: 'pending',
            })
            .select('*, profiles(name, flat)')
            .single()

        if (billErr) throw billErr
        return NextResponse.json(bill)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to generate bill'
        console.error('Bill generation error:', err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
