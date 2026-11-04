import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IAIExampleResponse } from '@/types/database.types';

export const runtime = 'edge';

interface IGenerateExampleRequest {
  word: string;
  geminiKey: string;
}

const GENERATE_EXAMPLE_SYSTEM_PROMPT = `
You are a Senior IELTS Linguistic Architect.
Given a target English vocabulary word or phrase, generate two contrasting Band 8.5+ examples:
1. "academic_example": A formal IELTS Writing Task 2 sentence employing Nominalization and Academic Hedging.
2. "speaking_example": A natural IELTS Speaking Part 3 sentence integrating authentic Phrasal Verbs and rhythm chunking markers ('/' for short pause, '//' for longer thought shift).

Return ONLY a valid JSON object matching this exact schema:
{
  "academic_example": "string",
  "speaking_example": "string"
}
`;

function isValidRequest(body: unknown): body is IGenerateExampleRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const rec = body as Record<string, unknown>;
  return typeof rec.word === 'string' && typeof rec.geminiKey === 'string';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody: unknown = await req.json();
    if (!isValidRequest(rawBody)) {
      return NextResponse.json(
        { error: 'Thiếu từ vựng mục tiêu hoặc Gemini API Key.' },
        { status: 400 }
      );
    }

    const word = rawBody.word.trim();
    const geminiKey = rawBody.geminiKey.trim();

    if (!word || !geminiKey || geminiKey.length < 15) {
      return NextResponse.json(
        { error: 'Từ vựng hoặc Gemini API Key không hợp lệ.' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const primaryModel = genAI.getGenerativeModel({
      model: 'gemini-3.8-flash',
      systemInstruction: GENERATE_EXAMPLE_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    let rawJsonText = '';
    try {
      const result = await primaryModel.generateContent(
        `Target vocabulary word: "${word}"`
      );
      rawJsonText = result.response.text();
    } catch {
      const fallbackModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: GENERATE_EXAMPLE_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });
      const fallbackResult = await fallbackModel.generateContent(
        `Target vocabulary word: "${word}"`
      );
      rawJsonText = fallbackResult.response.text();
    }

    const cleaned = rawJsonText
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed: unknown = JSON.parse(cleaned);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'academic_example' in parsed &&
      'speaking_example' in parsed
    ) {
      const rec = parsed as Record<string, unknown>;
      const responsePayload: IAIExampleResponse = {
        academic_example: String(rec.academic_example || ''),
        speaking_example: String(rec.speaking_example || ''),
      };
      return NextResponse.json(responsePayload, { status: 200 });
    }

    throw new Error('Cấu trúc JSON trả về từ AI không hợp lệ.');
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Lỗi khi gọi /api/generate-example.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}