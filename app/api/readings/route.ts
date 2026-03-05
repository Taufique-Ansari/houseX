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
            .select('*, profiles(name, flat)')
            .order('submitted_at', { ascending: false })

        if (profile?.role !== 'admin') {
            query = query.eq('user_id', user.id)
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

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()

        const contentType = req.headers.get('content-type') || ''
        let user_id: string, month: number, year: number, reading_value: number, source: string
        let photo_url: string | null = null

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData()
            user_id = formData.get('user_id') as string
            month = Number(formData.get('month'))
            year = Number(formData.get('year'))
            reading_value = Number(formData.get('reading_value'))
            source = (formData.get('source') as string) || 'manual'

            const image = formData.get('image') as File | null
            if (image) {
                const arrayBuffer = await image.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                const fileName = `${user_id}/${year}-${month}-${Date.now()}.jpg`

                const { error: uploadError } = await supabaseAdmin.storage
                    .from('meter-photos')
                    .upload(fileName, buffer, { contentType: image.type, upsert: true })

                if (!uploadError) {
                    const { data: urlData } = await supabaseAdmin.storage
                        .from('meter-photos')
                        .createSignedUrl(fileName, 60 * 60 * 24 * 365)
                    photo_url = urlData?.signedUrl || null
                }
            }
        } else {
            const body = await req.json()
            user_id = body.user_id
            month = body.month
            year = body.year
            reading_value = body.reading_value
            source = body.source || 'manual'
            photo_url = body.photo_url || null
        }

        // Tenants can only submit their own readings
        if (profile?.role !== 'admin' && user_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        if (!user_id || !month || !year || reading_value === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Upsert: delete existing then insert
        await supabaseAdmin
            .from('meter_readings')
            .delete()
            .eq('user_id', user_id)
            .eq('month', month)
            .eq('year', year)

        const { data, error } = await supabaseAdmin
            .from('meter_readings')
            .insert({
                user_id,
                month,
                year,
                reading_value,
                source,
                photo_url,
            })
            .select('*, profiles(name, flat)')
            .single()

        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to save reading'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
