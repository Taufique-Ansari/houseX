import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const users: any[] = [
    {
        username: 'admin', password: 'admin@123',
        profile: { name: 'Admin', role: 'admin' },
        tenant: null
    }
]

async function seed() {
    console.log('🌱 Seeding HX...\n')

    for (const u of users) {
        const email = `${u.username}@hx.com`

        // Check if user already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const exists = existingUsers?.users?.find(eu => eu.email === email)

        let userId: string

        if (exists) {
            userId = exists.id
            console.log(`⚠️  ${u.username} already exists (${userId}), updating profile...`)
            await supabase.from('profiles').upsert({ id: userId, email, ...u.profile })
        } else {
            const { data, error } = await supabase.auth.admin.createUser({
                email, password: u.password, email_confirm: true
            })
            if (error) { console.error(`❌ ${u.username}:`, error.message); continue }
            userId = data.user.id
            await supabase.from('profiles').insert({ id: userId, email, ...u.profile })
            console.log(`✅ Created: ${u.username} (${userId})`)
        }

        if (u.tenant) {
            await supabase.from('tenants').upsert({ id: userId, ...(u.tenant as any) })
            console.log(`   → Tenant: ${u.tenant.flat}, Rent: ₹${u.tenant.rent_amount}`)
        }
    }

    console.log('\n✅ Seeding complete!')
    console.log('─────────────────────────────────')
    console.log('Admin Username: admin / admin@123')
}

seed()
