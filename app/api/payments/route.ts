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
            .from('payments')
            .select('*, tenants(flat, profiles(name)), statements(month, year)')
            .order('paid_at', { ascending: false })

        if (profile?.role !== 'admin') {
            query = query.eq('tenant_id', user.id)
        }

        const { data, error } = await query
        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch payments'
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

        const formData = await req.formData()
        const statement_id = formData.get('statement_id') as string
        const amount = Number(formData.get('amount'))
        const payment_method = formData.get('payment_method') as string || 'other'
        const note = formData.get('note') as string || ''
        const paid_at = formData.get('paid_at') as string || new Date().toISOString()
        const proofImage = formData.get('proof_image') as File | null

        if (!statement_id || !amount || amount <= 0) {
            return NextResponse.json({ error: 'statement_id and positive amount required' }, { status: 400 })
        }

        // Verify statement exists and user has access
        const { data: stmt } = await supabaseAdmin.from('statements').select('tenant_id, status').eq('id', statement_id).single()
        if (!stmt) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && stmt.tenant_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Upload proof image
        let proof_image_url: string | null = null
        if (proofImage && proofImage.size > 0) {
            const buffer = Buffer.from(await proofImage.arrayBuffer())
            const fileName = `${statement_id}/${Date.now()}_${proofImage.name}`

            // Try 'payment-proofs' bucket first, fallback to 'proofs'
            let uploadBucket = 'payment-proofs'
            let { error: uploadErr } = await supabaseAdmin.storage.from(uploadBucket).upload(fileName, buffer, { contentType: proofImage.type, upsert: true })
            if (uploadErr) {
                console.error(`[Payment Proof] Upload to '${uploadBucket}' failed:`, uploadErr.message)
                // Try alternative bucket names
                for (const altBucket of ['proofs', 'payment_proofs', 'payments']) {
                    const { error: altErr } = await supabaseAdmin.storage.from(altBucket).upload(fileName, buffer, { contentType: proofImage.type, upsert: true })
                    if (!altErr) { uploadBucket = altBucket; uploadErr = null; break }
                }
                if (uploadErr) console.error('[Payment Proof] All bucket names failed. Create a bucket named "payment-proofs" in Supabase Storage.')
            }

            if (!uploadErr) {
                const { data: urlData } = await supabaseAdmin.storage.from(uploadBucket).createSignedUrl(fileName, 60 * 60 * 24 * 365)
                proof_image_url = urlData?.signedUrl || null
            }
        }

        // Insert payment (trigger will auto-update statement total_paid and status)
        const { data: payment, error } = await supabaseAdmin
            .from('payments')
            .insert({
                statement_id,
                tenant_id: stmt.tenant_id,
                amount,
                payment_method,
                proof_image_url,
                note,
                paid_at,
                recorded_by: user.id,
            })
            .select()
            .single()

        if (error) throw error

        // Insert ledger entry
        await supabaseAdmin.from('ledger_entries').insert({
            tenant_id: stmt.tenant_id, statement_id,
            type: 'payment', description: `Payment via ${payment_method}`, amount: -amount, created_by: user.id,
        })

        return NextResponse.json(payment)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to record payment'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
