import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

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

        // Get the bill to verify ownership
        const { data: bill } = await supabaseAdmin
            .from('bills')
            .select('user_id')
            .eq('id', id)
            .single()

        if (!bill) {
            return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
        }

        // Verify: either the bill owner or admin
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && bill.user_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        let payment_proof_url: string | null = null

        const contentType = req.headers.get('content-type') || ''
        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData()
            const image = formData.get('payment_proof') as File | null

            if (image) {
                const arrayBuffer = await image.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                const fileName = `${bill.user_id}/${id}-${Date.now()}.jpg`

                const { error: uploadError } = await supabaseAdmin.storage
                    .from('payment-proofs')
                    .upload(fileName, buffer, { contentType: image.type, upsert: true })

                if (!uploadError) {
                    // Use signed URL (works for both public and private buckets)
                    const { data: urlData } = await supabaseAdmin.storage
                        .from('payment-proofs')
                        .createSignedUrl(fileName, 60 * 60 * 24 * 365) // 1 year
                    payment_proof_url = urlData?.signedUrl || null
                }
            }
        }

        const { data: updated, error } = await supabaseAdmin
            .from('bills')
            .update({
                status: 'paid',
                payment_proof_url,
                paid_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('*, profiles(name, flat)')
            .single()

        if (error) throw error
        return NextResponse.json(updated)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update payment'
        console.error('Payment error:', err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
