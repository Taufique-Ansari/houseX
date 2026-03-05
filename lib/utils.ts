export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const CUR_M = new Date().getMonth() + 1;
export const CUR_Y = new Date().getFullYear();

export const fmtINR = (n: number) =>
    `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtM = (m: number, y: number) => `${MONTHS[m - 1]} ${y}`;

// Types
export interface Profile {
    id: string;
    name: string;
    username: string;
    role: 'admin' | 'tenant';
    flat: string;
    phone?: string;
    created_at?: string;
}

export interface ElectricityRate {
    id: string;
    month: number;
    year: number;
    total_units: number;
    total_amount: number;
    per_unit_rate: number;
    source: 'manual' | 'bill_ocr';
    bill_image_url: string | null;
    set_by: string;
    created_at: string;
}

export interface MeterReading {
    id: string;
    user_id: string;
    month: number;
    year: number;
    reading_value: number;
    photo_url: string | null;
    source: 'manual' | 'ocr';
    submitted_at: string;
    // Joined fields
    profiles?: {
        name: string;
        flat: string;
    };
}

export interface Bill {
    id: string;
    user_id: string;
    month: number;
    year: number;
    prev_reading: number;
    curr_reading: number;
    units_used: number;
    per_unit_rate: number;
    amount: number;
    status: 'pending' | 'paid';
    payment_proof_url: string | null;
    paid_at: string | null;
    generated_at: string;
    // Joined fields
    profiles?: {
        name: string;
        flat: string;
    };
}
