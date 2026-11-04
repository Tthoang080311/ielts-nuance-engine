import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ISpeakingNaturalizerItem } from '@/types/database.types';

export const runtime = 'edge';

interface ISpeakNaturalizerRequestBody {
  spokenText: string;
  geminiKey?: string;
}

const SPEAK_NATURALIZER_SYSTEM_PROMPT = `
You are an expert IELTS Speaking Examiner and Native Naturalizer (Target Band 7.5+).
Analyze the user's spoken script and identify overly formal, written-style words or awkward phrasings (e.g., "furthermore", "thus", "moreover", "in my opinion", "utilize").
Replace them with authentic spoken collocations, idiomatic expressions, and natural phrasal verbs (e.g., "bring about", "wind up", "end up", "cut down on").

CRITICAL RULE:
You MUST insert rhythm chunking markers directly into the "suggestedText":
- Use '/' for a short pause (micro-breath).
- Use '//' for a longer pause when shifting thoughts or emphasizing a point.

You MUST return ONLY a valid JSON array matching this exact schema:
[
  {
    "originalSnippet": "exact awkward snippet from user script",
    "overlyFormalWord": "formal word used",
    "suggestedText": "natural spoken upgrade with / and // markers",
    "phrasalVerbUsed": "the key phrasal verb or idiom integrated",
    "explanation": "Concise explanation in Vietnamese on why this sounds more natural in Part 2/3",
    "startIndex": 0,
    "endIndex": 12
  }
]
`;

function isSpeakRequestBody(value: unknown): value is ISpeakNaturalizerRequestBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.spokenText === 'string' &&
    (typeof rec.geminiKey === 'string' || typeof rec.geminiKey === 'undefined')
  );
}

function resolveValidGeminiKey(clientKey?: string): string {
  const trimmedClient = typeof clientKey === 'string' ? clientKey.trim() : '';
  if (trimmedClient.startsWith('AIza') && trimmedClient.length >= 30) {
    return trimmedClient;
  }

  const envKey = (
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    ''
  ).trim();

  if (envKey.startsWith('AIza') && envKey.length >= 30) {
    return envKey;
  }

  return '';
}

function extractJsonArray(rawText: string): unknown {
  const trimmed = rawText.trim();
  const startBracket = trimmed.indexOf('[');
  const endBracket = trimmed.lastIndexOf(']');

  if (startBracket === -1 || endBracket === -1 || endBracket < startBracket) {
    throw new Error('Phản hồi từ AI không chứa mảng JSON hợp lệ.');
  }

  const jsonSlice = trimmed.slice(startBracket, endBracket + 1);
  return JSON.parse(jsonSlice);
}

function sanitizeAndAlignSpeaking(
  rawParsed: unknown,
  sourceText: string
): ISpeakingNaturalizerItem[] {
  if (!Array.isArray(rawParsed)) {
    return [];
  }

  const aligned: ISpeakingNaturalizerItem[] = [];
  let searchCursor = 0;

  for (const entry of rawParsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const originalSnippet =
      typeof record.originalSnippet === 'string' ? record.originalSnippet.trim() : '';
    const overlyFormalWord =
      typeof record.overlyFormalWord === 'string' ? record.overlyFormalWord.trim() : '';
    const suggestedText =
      typeof record.suggestedText === 'string' ? record.suggestedText.trim() : '';
    const phrasalVerbUsed =
      typeof record.phrasalVerbUsed === 'string' ? record.phrasalVerbUsed.trim() : '';
    const explanation =
      typeof record.explanation === 'string' ? record.explanation.trim() : '';

    if (!originalSnippet || !suggestedText) {
      continue;
    }

    let exactMatchIndex = sourceText.indexOf(originalSnippet, searchCursor);
    if (exactMatchIndex === -1) {
      exactMatchIndex = sourceText.indexOf(originalSnippet);
    }

    const startIndex =
      exactMatchIndex !== -1
        ? exactMatchIndex
        : typeof record.startIndex === 'number' && record.startIndex >= 0
        ? record.startIndex
        : 0;

    const endIndex =
      exactMatchIndex !== -1
        ? exactMatchIndex + originalSnippet.length
        : typeof record.endIndex === 'number' && record.endIndex > startIndex
        ? record.endIndex
        : startIndex + originalSnippet.length;

    if (exactMatchIndex !== -1) {
      searchCursor = endIndex;
    }

    aligned.push({
      originalSnippet,
      overlyFormalWord: overlyFormalWord || originalSnippet,
      suggestedText,
      phrasalVerbUsed: phrasalVerbUsed || 'Natural collocation',
      explanation: explanation || 'Nâng cấp ngữ điệu văn nói tự nhiên hơn.',
      startIndex,
      endIndex,
    });
  }

  return aligned;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody: unknown = await req.json();

    if (!isSpeakRequestBody(rawBody)) {
      return NextResponse.json(
        { error: 'Payload thiếu trường spokenText hợp lệ.' },
        { status: 400 }
      );
    }

    const spokenText = rawBody.spokenText.trim();
    const geminiKey = resolveValidGeminiKey(rawBody.geminiKey);

    if (!geminiKey) {
      return NextResponse.json(
        {
          error:
            'Gemini API Key không hợp lệ. Vui lòng sử dụng mã từ Google AI Studio (bắt đầu bằng "AIza...").',
        },
        { status: 401 }
      );
    }

    if (spokenText.length < 10) {
      return NextResponse.json([], { status: 200 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const userPrompt = `Naturalize this IELTS Speaking response and return the JSON array:\n\n"""\n${spokenText}\n"""`;

    const primaryModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SPEAK_NATURALIZER_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    let rawResponseText = '';

    try {
      const result = await primaryModel.generateContent(userPrompt);
      rawResponseText = result.response.text();
    } catch (primaryErr: unknown) {
      const fallbackModel = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: SPEAK_NATURALIZER_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });
      try {
        const fallbackResult = await fallbackModel.generateContent(userPrompt);
        rawResponseText = fallbackResult.response.text();
      } catch (fallbackErr: unknown) {
        throw fallbackErr instanceof Error ? fallbackErr : primaryErr;
      }
    }

    const parsedJson: unknown = extractJsonArray(rawResponseText);
    const validatedItems = sanitizeAndAlignSpeaking(parsedJson, spokenText);

    return NextResponse.json(validatedItems, { status: 200 });
  } catch (error: unknown) {
    console.error('[SPEAK_NATURALIZER_ERROR]:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Lỗi trong Edge API speak-naturalizer.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}