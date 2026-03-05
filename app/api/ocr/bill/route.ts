import { NextRequest, NextResponse } from 'next/server'
import { HfInference } from '@huggingface/inference'

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY)

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const file = formData.get('image') as File
        if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

        const arrayBuffer = await file.arrayBuffer()
        const blob = new Blob([arrayBuffer], { type: file.type })

        // Ask two separate questions for reliability
        const [unitsResult, amountResult] = await Promise.all([
            hf.visualQuestionAnswering({
                model: 'dandelin/vilt-b32-finetuned-vqa',
                inputs: {
                    image: blob,
                    question: 'What is the total units consumed in kWh shown on this electricity bill? Return only the number.'
                }
            }),
            hf.visualQuestionAnswering({
                model: 'dandelin/vilt-b32-finetuned-vqa',
                inputs: {
                    image: blob,
                    question: 'What is the total amount payable in rupees shown on this electricity bill? Return only the number.'
                }
            })
        ])

        const units = parseFloat((unitsResult.answer || '').replace(/[^0-9.]/g, ''))
        const amount = parseFloat((amountResult.answer || '').replace(/[^0-9.]/g, ''))

        if (!units || !amount || isNaN(units) || isNaN(amount)) {
            return NextResponse.json({ success: false, units: null, amount: null })
        }

        return NextResponse.json({ success: true, units, amount })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'OCR failed'
        console.error('OCR bill error:', err)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}
