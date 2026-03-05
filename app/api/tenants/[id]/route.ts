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

        // Tenants can view own, admin can view any
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin' && user.id !== id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { data: tenant, error } = await supabaseAdmin
            .from('tenants')
            .select('*, profiles(*)')
            .eq('id', id)
            .single()

        if (error || !tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

        // Also get rent revisions
        const { data: revisions } = await supabaseAdmin
            .from('rent_revisions')
            .select('*')
            .eq('tenant_id', id)
            .order('effective_date', { ascending: false })

        return NextResponse.json({ ...tenant, rent_revisions: revisions || [] })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch tenant'
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
        const { name, phone, flat, rent_amount, rent_due_day, wifi_opted_in, notes,
            lease_start_date, lease_end_date } = body

        // If rent amount is changing, track revision
        if (rent_amount !== undefined) {
            const { data: currentTenant } = await supabaseAdmin.from('tenants').select('rent_amount').eq('id', id).single()
            if (currentTenant && Number(currentTenant.rent_amount) !== Number(rent_amount)) {
                await supabaseAdmin.from('rent_revisions').insert({
                    tenant_id: id,
                    old_amount: currentTenant.rent_amount,
                    new_amount: rent_amount,
                    effective_date: new Date().toISOString().split('T')[0],
                    reason: body.rent_revision_reason || 'Rent updated by admin',
                    created_by: user.id,
                })
            }
        }

        // Update profile fields
        const profileUpdates: Record<string, string> = {}
        if (name !== undefined) profileUpdates.name = name
        if (phone !== undefined) profileUpdates.phone = phone
        if (Object.keys(profileUpdates).length > 0) {
            await supabaseAdmin.from('profiles').update(profileUpdates).eq('id', id)
        }

        // Update tenant fields
        const tenantUpdates: Record<string, unknown> = {}
        if (flat !== undefined) tenantUpdates.flat = flat
        if (rent_amount !== undefined) tenantUpdates.rent_amount = rent_amount
        if (rent_due_day !== undefined) tenantUpdates.rent_due_day = rent_due_day
        if (wifi_opted_in !== undefined) tenantUpdates.wifi_opted_in = wifi_opted_in
        if (notes !== undefined) tenantUpdates.notes = notes
        if (lease_start_date !== undefined) tenantUpdates.lease_start_date = lease_start_date
        if (lease_end_date !== undefined) tenantUpdates.lease_end_date = lease_end_date

        if (Object.keys(tenantUpdates).length > 0) {
            await supabaseAdmin.from('tenants').update(tenantUpdates).eq('id', id)
        }

        const { data: updated } = await supabaseAdmin.from('tenants').select('*, profiles(*)').eq('id', id).single()
        return NextResponse.json(updated)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update tenant'
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

        // Fetch to-be-deleted records that have files
        const { data: payments } = await supabaseAdmin.from('payments').select('proof_image_url').eq('tenant_id', id).not('proof_image_url', 'is', null)
        const { data: readings } = await supabaseAdmin.from('meter_readings').select('photo_url').eq('tenant_id', id).not('photo_url', 'is', null)

        // Cascade delete from DB with error checking
        const cascadeDeletes = [
            { table: 'tenant_documents', col: 'tenant_id' },
            { table: 'ledger_entries', col: 'tenant_id' },
            { table: 'payments', col: 'tenant_id' },
            { table: 'statements', col: 'tenant_id' },
            { table: 'meter_readings', col: 'tenant_id' },
            { table: 'rent_revisions', col: 'tenant_id' },
        ]

        for (const { table, col } of cascadeDeletes) {
            const { error } = await supabaseAdmin.from(table).delete().eq(col, id)
            if (error) console.error(`Failed to delete ${table}:`, error)
        }

        // Delete tenant properties and profile
        const { error: tErr } = await supabaseAdmin.from('tenants').delete().eq('id', id)
        if (tErr) console.error('Failed to delete tenant:', tErr)

        const { error: pErr } = await supabaseAdmin.from('profiles').delete().eq('id', id)
        if (pErr) console.error('Failed to delete profile:', pErr)

        // Delete from Auth
        const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id)
        if (authErr) throw authErr

        // Delete Storage Files (Best effort, non-blocking)
        try {
            if (payments && payments.length > 0) {
                const paths = payments.map(p => p.proof_image_url?.split('/payment-proofs/')[1]?.split('?')[0]).filter(Boolean) as string[]
                if (paths.length > 0) await supabaseAdmin.storage.from('payment-proofs').remove(paths)
            }
            if (readings && readings.length > 0) {
                const paths = readings.map(r => r.photo_url?.split('/meter-photos/')[1]?.split('?')[0]).filter(Boolean) as string[]
                if (paths.length > 0) await supabaseAdmin.storage.from('meter-photos').remove(paths)
            }
        } catch (e) {
            console.error('Storage cleanup failed:', e)
        }

        return NextResponse.json({ success: true })
    } catch (err: unknown) {
        console.error('DELETE Tenant Error:', err)
        const message = err instanceof Error ? err.message : 'Failed to delete tenant'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
