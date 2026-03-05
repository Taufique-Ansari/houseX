import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const image = formData.get('image') as File
        if (!image) return NextResponse.json({ success: false, units: null, amount: null })

        const hfKey = process.env.HUGGINGFACE_API_KEY
        if (!hfKey) return NextResponse.json({ success: false, units: null, amount: null, error: 'HF key not set' })

        const buffer = Buffer.from(await image.arrayBuffer())
        const base64 = buffer.toString('base64')

        const [unitsRes, amountRes] = await Promise.all([
            fetch('https://api-inference.huggingface.co/models/dandelin/vilt-b32-finetuned-vqa', {
                method: 'POST',
                headers: { Authorization: `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: { image: base64, question: 'What is the total units consumed in kWh on this electricity bill? Number only.' } }),
            }),
            fetch('https://api-inference.huggingface.co/models/dandelin/vilt-b32-finetuned-vqa', {
                method: 'POST',
                headers: { Authorization: `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: { image: base64, question: 'What is the total amount payable in rupees on this bill? Number only.' } }),
            }),
        ])

        const unitsData = await unitsRes.json()
        const amountData = await amountRes.json()

        const units = Array.isArray(unitsData) && unitsData[0]?.answer
            ? Number(unitsData[0].answer.replace(/[^0-9.]/g, '')) || null : null
        const amount = Array.isArray(amountData) && amountData[0]?.answer
            ? Number(amountData[0].answer.replace(/[^0-9.]/g, '')) || null : null

        return NextResponse.json({ success: !!(units && amount), units, amount })
    } catch (err) {
        console.error('[OCR Bill]', err)
        return NextResponse.json({ success: false, units: null, amount: null })
    }
}
