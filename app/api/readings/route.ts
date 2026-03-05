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

        let query = supabaseAdmin
            .from('meter_readings')
            .select('*, tenants(flat, profiles(name))')
            .order('submitted_at', { ascending: false })

        if (profile?.role !== 'admin') {
            query = query.eq('tenant_id', user.id)
        }

        const { data, error } = await query
        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch readings'
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

        const contentType = req.headers.get('content-type') || ''
        let tenant_id: string, month: number, year: number, reading_value: number, source: string
        let photo_url: string | null = null

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData()
            tenant_id = formData.get('tenant_id') as string
            month = Number(formData.get('month'))
            year = Number(formData.get('year'))
            reading_value = Number(formData.get('reading_value'))
            source = (formData.get('source') as string) || 'manual'

            const image = formData.get('image') as File | null
            if (image && image.size > 0) {
                const buffer = Buffer.from(await image.arrayBuffer())
                const fileName = `${tenant_id}/${month}_${year}_${Date.now()}.jpg`
                await supabaseAdmin.storage.from('meter-photos').upload(fileName, buffer, { contentType: image.type, upsert: true })
                const { data: urlData } = await supabaseAdmin.storage.from('meter-photos').createSignedUrl(fileName, 60 * 60 * 24 * 365)
                photo_url = urlData?.signedUrl || null
            }
        } else {
            const body = await req.json()
            tenant_id = body.tenant_id
            month = Number(body.month)
            year = Number(body.year)
            reading_value = Number(body.reading_value)
            source = body.source || 'manual'
        }

        if (!tenant_id || !month || !year || isNaN(reading_value)) {
            return NextResponse.json({ error: 'tenant_id, month, year, reading_value required' }, { status: 400 })
        }

        // Verify admin or own
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && user.id !== tenant_id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { data, error } = await supabaseAdmin
            .from('meter_readings')
            .upsert({
                tenant_id, month, year, reading_value, source,
                photo_url, submitted_by: user.id,
            }, { onConflict: 'tenant_id,month,year' })
            .select()
            .single()

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to save reading'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
