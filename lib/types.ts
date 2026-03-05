// ════════════════════════════════════════════
// HX — TypeScript Interfaces
// ════════════════════════════════════════════

export interface Profile {
    id: string
    name: string
    email: string
    phone?: string
    role: 'admin' | 'tenant'
    created_at?: string
}

export interface Tenant {
    id: string
    flat: string
    rent_amount: number
    rent_due_day: number
    wifi_opted_in: boolean
    move_in_date?: string
    lease_start_date?: string
    lease_end_date?: string
    security_deposit_amount: number
    security_deposit_date?: string
    is_active: boolean
    notes?: string
    created_at?: string
    // Joined
    profiles?: Profile
}

export interface RentRevision {
    id: string
    tenant_id: string
    old_amount: number
    new_amount: number
    effective_date: string
    reason?: string
    created_by?: string
    created_at?: string
}

export interface UtilityConfig {
    id: string
    month: number
    year: number
    electricity_per_unit_rate?: number
    electricity_total_units?: number
    electricity_total_amount?: number
    electricity_source?: 'manual' | 'bill_ocr'
    electricity_bill_image_url?: string
    water_charge_per_tenant: number
    wifi_charge_per_tenant: number
    set_by?: string
    created_at?: string
}

export interface MeterReading {
    id: string
    tenant_id: string
    month: number
    year: number
    reading_value: number
    photo_url?: string
    source: 'manual' | 'ocr'
    submitted_by?: string
    submitted_at?: string
    // Joined
    tenants?: { flat: string; profiles?: { name: string } }
}

export interface OneTimeCharge {
    description: string
    amount: number
    added_by?: string
    added_at?: string
}

export interface Statement {
    id: string
    tenant_id: string
    month: number
    year: number
    rent_charge: number
    electricity_charge: number
    electricity_units?: number
    electricity_rate?: number
    prev_meter_reading?: number
    curr_meter_reading?: number
    water_charge: number
    wifi_charge: number
    one_time_charges: OneTimeCharge[]
    previous_dues: number | string
    credit_from_previous: number
    total_charges: number
    total_due: number
    total_paid: number
    balance: number
    status: 'draft' | 'published' | 'partial' | 'paid' | 'overdue'
    due_date?: string
    is_prorated?: boolean
    proration_days?: number
    published_at?: string
    generated_by?: string
    generated_at?: string
    // Joined
    tenants?: { flat: string; profiles?: { name: string } }
    payments?: Payment[]
}

export interface Payment {
    id: string
    statement_id: string
    tenant_id: string
    amount: number
    payment_method?: 'upi' | 'cash' | 'bank_transfer' | 'cheque' | 'other'
    proof_image_url?: string
    note?: string
    paid_at: string
    recorded_by?: string
    created_at?: string
    // Joined
    tenants?: { flat: string; profiles?: { name: string } }
    statements?: { month: number; year: number }
}

export interface LedgerEntry {
    id: string
    tenant_id: string
    statement_id?: string
    type: 'charge' | 'payment' | 'credit' | 'adjustment' | 'deposit' | 'refund'
    description: string
    amount: number
    created_by?: string
    created_at?: string
}

export interface TenantDocument {
    id: string
    tenant_id: string
    type: 'rent_agreement' | 'id_proof' | 'move_in_checklist' | 'other'
    label: string
    file_url: string
    uploaded_by?: string
    uploaded_at?: string
    notes?: string
}
