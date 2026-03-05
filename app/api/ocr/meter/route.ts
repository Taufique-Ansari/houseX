import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const image = formData.get('image') as File
        if (!image) return NextResponse.json({ success: false, reading: null })

        // Try Hugging Face VQA
        const hfKey = process.env.HUGGINGFACE_API_KEY
        if (!hfKey) return NextResponse.json({ success: false, reading: null, error: 'HF key not set' })

        const buffer = Buffer.from(await image.arrayBuffer())
        const base64 = buffer.toString('base64')

        const res = await fetch('https://api-inference.huggingface.co/models/dandelin/vilt-b32-finetuned-vqa', {
            method: 'POST',
            headers: { Authorization: `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inputs: {
                    image: base64,
                    question: 'What is the numeric reading on this electricity meter? Numbers only.',
                },
            }),
        })

        const data = await res.json()
        if (Array.isArray(data) && data[0]?.answer) {
            const reading = data[0].answer.replace(/[^0-9.]/g, '')
            if (reading) return NextResponse.json({ success: true, reading: Number(reading) })
        }

        return NextResponse.json({ success: false, reading: null })
    } catch (err) {
        console.error('[OCR Meter]', err)
        return NextResponse.json({ success: false, reading: null })
    }
}
