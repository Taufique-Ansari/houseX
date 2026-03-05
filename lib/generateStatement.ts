import { supabaseAdmin } from './supabase-server'
import { monthName } from './utils'

export async function generateStatement(tenantId: string, month: number, year: number, adminId: string) {

    // ─── 0. Check if existing statement is already paid ───
    const { data: existingStmt } = await supabaseAdmin
        .from('statements')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('month', month)
        .eq('year', year)
        .single()

    if (existingStmt && existingStmt.status === 'paid') {
        throw new Error('Statement for this month is already paid and cannot be modified.')
    }

    // ─── 1. Load tenant ───
    const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .select('*, profiles(name)')
        .eq('id', tenantId)
        .single()

    if (tenantErr || !tenant) throw new Error('Tenant not found.')
    if (!tenant.is_active)    throw new Error('Tenant is inactive.')

    // ─── 2. Previous month refs ───
    const [prevConfigM, prevConfigY] = month === 1 ? [12, year - 1] : [month - 1, year]

    // ─── 3. Load utility config for PREVIOUS month (electricity rate + fallback) ───
    // The electricity consumed in a March bill = March reading − Feb reading.
    // That consumption happened during February, so the rate must come from
    // February's Mahavitaran bill — not March's.
    // We also use this as a fallback for water/wifi if current month config is missing.
    const { data: prevConfig } = await supabaseAdmin
        .from('utility_config')
        .select('*')
        .eq('month', prevConfigM)
        .eq('year', prevConfigY)
        .single()

    if (!prevConfig) {
        throw new Error(
            `Utility config for ${monthName(prevConfigM)} ${prevConfigY} not found. ` +
            `Please set the electricity rate and utility charges for ${monthName(prevConfigM)} ${prevConfigY} first.`
        )
    }

    // ─── 4. Load utility config for CURRENT month (water/wifi) ───
    // Optional — if not set yet, fall back to previous month's water/wifi values.
    // This means the admin only needs to set the current month config if water/wifi
    // charges have changed. Electricity always uses the previous month's config.
    const { data: currConfig } = await supabaseAdmin
        .from('utility_config')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .single()

    // Resolve water and wifi — prefer current month if available, else fall back
    const waterChargeSrc = currConfig ?? prevConfig
    const wifiChargeSrc  = currConfig ?? prevConfig

    if (!currConfig) {
        console.warn(
            `No utility config found for ${monthName(month)} ${year}. ` +
            `Falling back to ${monthName(prevConfigM)} ${prevConfigY} values for water and WiFi charges.`
        )
    }

    // ─── 5. RENT — check proration for mid-month move-in ───
    let rentCharge  = Number(tenant.rent_amount)
    let isProrated  = false
    let proratedDays: number | null = null

    if (tenant.move_in_date) {
        const moveIn      = new Date(tenant.move_in_date)
        const moveInYear  = moveIn.getFullYear()
        const moveInMonth = moveIn.getMonth() + 1
        const moveInDay   = moveIn.getDate()

        if (moveInYear === year && moveInMonth === month && moveInDay > 1) {
            const daysInMonth = new Date(year, month, 0).getDate()
            proratedDays = daysInMonth - moveInDay + 1
            rentCharge   = Math.round((Number(tenant.rent_amount) / daysInMonth) * proratedDays)
            isProrated   = true
        }
    }

    // ─── 6. ELECTRICITY ───
    // Consumption  = current month reading − previous month reading
    // Rate applied = previous month's utility config rate
    let electricityCharge = 0
    let unitsUsed:   number | null = null
    let prevReading: number | null = null
    let currReading: number | null = null

    if (prevConfig.electricity_per_unit_rate) {
        const [prevReadingM, prevReadingY] = month === 1 ? [12, year - 1] : [month - 1, year]

        const { data: currMeterReading } = await supabaseAdmin
            .from('meter_readings')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('month', month)
            .eq('year', year)
            .single()

        const { data: prevMeterReading } = await supabaseAdmin
            .from('meter_readings')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('month', prevReadingM)
            .eq('year', prevReadingY)
            .single()

        if (!currMeterReading) {
            console.warn(
                `No meter reading found for ${monthName(month)} ${year} — electricity charge will be 0.`
            )
        } else if (!prevMeterReading) {
            console.warn(
                `No meter reading found for ${monthName(prevReadingM)} ${prevReadingY} — electricity charge will be 0.`
            )
        } else {
            const curr = Number(currMeterReading.reading_value)
            const prev = Number(prevMeterReading.reading_value)

            if (curr < prev) {
                throw new Error(
                    `Current meter reading (${curr}) is less than previous reading (${prev}). ` +
                    `Please verify the readings for ${monthName(prevReadingM)} ${prevReadingY} and ${monthName(month)} ${year}.`
                )
            }

            unitsUsed         = curr - prev
            electricityCharge = Math.round(unitsUsed * Number(prevConfig.electricity_per_unit_rate) * 100) / 100
            prevReading       = prev
            currReading       = curr
        }
    } else {
        console.warn(
            `No electricity rate set in ${monthName(prevConfigM)} ${prevConfigY} config — electricity charge will be 0.`
        )
    }

    // ─── 7. WATER (flat per tenant) ───
    const waterCharge = Number(waterChargeSrc.water_charge_per_tenant)

    // ─── 8. WIFI (only if tenant opted in) ───
    const wifiCharge = tenant.wifi_opted_in ? Number(wifiChargeSrc.wifi_charge_per_tenant) : 0

    // ─── 9. CARRY FORWARD from previous month statement ───
    // Positive balance → previous dues  (added as a charge)
    // Negative balance → credit         (deducted from total)
    const [prevStmtM, prevStmtY] = month === 1 ? [12, year - 1] : [month - 1, year]

    const { data: prevStatement } = await supabaseAdmin
        .from('statements')
        .select('balance')
        .eq('tenant_id', tenantId)
        .eq('month', prevStmtM)
        .eq('year', prevStmtY)
        .single()

    let previousDues       = 0
    let creditFromPrevious = 0

    if (prevStatement) {
        const bal = Number(prevStatement.balance)
        if (bal > 0)      previousDues       = bal
        else if (bal < 0) creditFromPrevious = Math.abs(bal)
    }

    // ─── 10. DUE DATE ───
    const dueDay  = tenant.move_in_date
        ? new Date(tenant.move_in_date).getDate()
        : tenant.rent_due_day
    const dueDate = new Date(year, month - 1, dueDay).toISOString().split('T')[0]

    // ─── 11. UPSERT STATEMENT ───
    const { data: statement, error: stmtErr } = await supabaseAdmin
        .from('statements')
        .upsert(
            {
                tenant_id:            tenantId,
                month,
                year,
                rent_charge:          rentCharge,
                electricity_charge:   electricityCharge,
                electricity_units:    unitsUsed,
                // Always store the rate actually used (previous month's rate)
                electricity_rate:     prevConfig.electricity_per_unit_rate
                                          ? Number(prevConfig.electricity_per_unit_rate)
                                          : null,
                prev_meter_reading:   prevReading,
                curr_meter_reading:   currReading,
                water_charge:         waterCharge,
                wifi_charge:          wifiCharge,
                previous_dues:        previousDues,
                credit_from_previous: creditFromPrevious,
                is_prorated:          isProrated,
                proration_days:       proratedDays,
                due_date:             dueDate,
                // Preserve status if already published/partial — only reset if draft or new
                status: existingStmt?.status && existingStmt.status !== 'draft'
                    ? existingStmt.status
                    : 'draft',
                generated_by:  adminId,
                generated_at:  new Date().toISOString(),
            },
            { onConflict: 'tenant_id,month,year' }
        )
        .select()
        .single()

    if (stmtErr) throw stmtErr

    // ─── 12. LEDGER ENTRIES ───
    // On regeneration: delete old charge/credit entries, re-insert fresh ones.
    // Payment entries are never deleted.
    await supabaseAdmin
        .from('ledger_entries')
        .delete()
        .eq('statement_id', statement.id)
        .in('type', ['charge', 'credit'])

    const ledgerEntries: {
        tenant_id:    string
        statement_id: string
        type:         'charge' | 'credit'
        description:  string
        amount:       number
        created_by:   string
    }[] = []

    // Rent
    ledgerEntries.push({
        tenant_id:    tenantId,
        statement_id: statement.id,
        type:         'charge',
        description:  `Rent — ${monthName(month)} ${year}`,
        amount:       rentCharge,
        created_by:   adminId,
    })

    // Electricity — label shows consumption period and rate used
    if (electricityCharge > 0) {
        const [prevReadingM, prevReadingY] = month === 1 ? [12, year - 1] : [month - 1, year]
        ledgerEntries.push({
            tenant_id:    tenantId,
            statement_id: statement.id,
            type:         'charge',
            description:  `Electricity (${unitsUsed} kWh @ ₹${prevConfig.electricity_per_unit_rate}/unit) — ${monthName(prevReadingM)} ${prevReadingY}–${monthName(month)} ${year}`,
            amount:       electricityCharge,
            created_by:   adminId,
        })
    }

    // Water
    ledgerEntries.push({
        tenant_id:    tenantId,
        statement_id: statement.id,
        type:         'charge',
        description:  `Water — ${monthName(month)} ${year}`,
        amount:       waterCharge,
        created_by:   adminId,
    })

    // WiFi
    if (wifiCharge > 0) {
        ledgerEntries.push({
            tenant_id:    tenantId,
            statement_id: statement.id,
            type:         'charge',
            description:  `WiFi — ${monthName(month)} ${year}`,
            amount:       wifiCharge,
            created_by:   adminId,
        })
    }

    // Previous dues carried forward
    if (previousDues > 0) {
        ledgerEntries.push({
            tenant_id:    tenantId,
            statement_id: statement.id,
            type:         'charge',
            description:  `Previous outstanding balance from ${monthName(prevStmtM)} ${prevStmtY}`,
            amount:       previousDues,
            created_by:   adminId,
        })
    }

    // Credit carried forward
    if (creditFromPrevious > 0) {
        ledgerEntries.push({
            tenant_id:    tenantId,
            statement_id: statement.id,
            type:         'credit',
            description:  `Credit from ${monthName(prevStmtM)} ${prevStmtY}`,
            amount:       -creditFromPrevious,  // negative = reduces total due
            created_by:   adminId,
        })
    }

    await supabaseAdmin.from('ledger_entries').insert(ledgerEntries)

    return statement
}