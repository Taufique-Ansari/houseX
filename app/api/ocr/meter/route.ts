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

        // Use VQA model to read meter numbers
        const result = await hf.visualQuestionAnswering({
            model: 'dandelin/vilt-b32-finetuned-vqa',
            inputs: {
                image: blob,
                question: 'What is the numeric reading shown on this electricity meter? Return only the number.'
            }
        })

        // Extract numeric value from response
        const raw = result.answer || ''
        const numeric = raw.replace(/[^0-9.]/g, '')

        if (!numeric || isNaN(parseFloat(numeric))) {
            return NextResponse.json({ success: false, reading: null, raw })
        }

        return NextResponse.json({ success: true, reading: parseFloat(numeric), raw })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'OCR failed'
        console.error('OCR meter error:', err)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}
