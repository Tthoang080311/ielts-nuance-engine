import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HighlightCategory, IAcademicCritiqueItem } from '@/types/database.types';

export const runtime = 'edge';

interface IAcademicGraderRequestBody {
  essayText: string;
  geminiKey?: string;
}

const VALID_HIGHLIGHT_TYPES: ReadonlyArray<HighlightCategory> = [
  'Nominalization',
  'Inversion',
  'Hedging',
  'Cohesion',
];

const ACADEMIC_GRADER_SYSTEM_PROMPT = `
You are an ultra-strict IELTS Writing Task 2 Band 8.5+ Linguistic Examiner.
Analyze the user's essay text and identify specific segments that require upgrading according to these strict rules:
1. HEDGING: Catch overgeneralizations and absolute claims ("always", "never", "everyone", "completely", "undeniably", "only"). Rewrite them using academic hedging (e.g., "tends to", "appears to", "is frequently associated with", "may potentially").
2. NOMINALIZATION: Catch wordy clauses with weak verbs ("because cities grow very fast and people move..."). Convert verb/adjective clauses into dense academic noun phrases (e.g., "rapid urban proliferation and rural-to-urban migration...").
3. INVERSION: Identify sentences where emphatic academic inversion (e.g., "Not only does...", "Rarely have policymakers...") elevates rhetorical impact.
4. COHESION: Replace mechanical linkers ("Furthermore", "Moreover", "Firstly") with organic lexical cohesion and demonstrative reference ("This fiscal oversight...", "Such demographic shifts...").

You MUST return ONLY a valid JSON array matching this exact schema:
[
  {
    "originalSnippet": "exact substring from the user's essay",
    "highlightType": "Nominalization" | "Inversion" | "Hedging" | "Cohesion",
    "suggestedText": "rewritten Band 8.5+ academic replacement",
    "explanation": "Concise Vietnamese explanation of why this change boosts Lexical Resource & Grammatical Range",
    "startIndex": 0,
    "endIndex": 10
  }
]
`;

function isGraderRequestBody(value: unknown): value is IAcademicGraderRequestBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.essayText === 'string' &&
    (typeof rec.geminiKey === 'string' || typeof rec.geminiKey === 'undefined')
  );
}

// Chấp nhận cả khóa bắt đầu bằng "AQ." lẫn "AIza", ưu tiên tuyệt đối khóa từ Client gửi lên
function resolveValidGeminiKey(clientKey?: string): string {
  const trimmedClient = typeof clientKey === 'string' ? clientKey.trim() : '';
  if (trimmedClient.length >= 15) {
    return trimmedClient;
  }

  const envKey = (
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    ''
  ).trim();

  if (envKey.length >= 15) {
    return envKey;
  }

  return '';
}

function isFatalAuthOrClientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('403') ||
    msg.includes('401') ||
    msg.includes('400') ||
    msg.includes('leaked') ||
    msg.includes('api_key_invalid') ||
    msg.includes('permission_denied')
  );
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

function sanitizeAndAlignCritiques(
  rawParsed: unknown,
  sourceEssay: string
): IAcademicCritiqueItem[] {
  if (!Array.isArray(rawParsed)) {
    return [];
  }

  const aligned: IAcademicCritiqueItem[] = [];
  let searchCursor = 0;

  for (const entry of rawParsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const originalSnippet =
      typeof record.originalSnippet === 'string' ? record.originalSnippet.trim() : '';
    const suggestedText =
      typeof record.suggestedText === 'string' ? record.suggestedText.trim() : '';
    const explanation =
      typeof record.explanation === 'string' ? record.explanation.trim() : '';
    const rawType = record.highlightType;

    if (!originalSnippet || !suggestedText || !explanation) {
      continue;
    }

    const highlightType: HighlightCategory = VALID_HIGHLIGHT_TYPES.includes(
      rawType as HighlightCategory
    )
      ? (rawType as HighlightCategory)
      : 'Nominalization';

    let exactMatchIndex = sourceEssay.indexOf(originalSnippet, searchCursor);
    if (exactMatchIndex === -1) {
      exactMatchIndex = sourceEssay.indexOf(originalSnippet);
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
      highlightType,
      suggestedText,
      explanation,
      startIndex,
      endIndex,
    });
  }

  return aligned;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody: unknown = await req.json();

    if (!isGraderRequestBody(rawBody)) {
      return NextResponse.json(
        { error: 'Payload thiếu trường essayText hợp lệ.' },
        { status: 400 }
      );
    }

    const essayText = rawBody.essayText.trim();
    const geminiKey = resolveValidGeminiKey(rawBody.geminiKey);

    if (!geminiKey) {
      return NextResponse.json(
        { error: 'Gemini API Key không hợp lệ hoặc bị bỏ trống.' },
        { status: 401 }
      );
    }

    if (essayText.length < 15) {
      return NextResponse.json([], { status: 200 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const userPrompt = `Analyze this IELTS Writing Task 2 text and return the JSON array:\n\n"""\n${essayText}\n"""`;

    // Sử dụng duy nhất model gemini-3.8-flash
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.8-flash',
      systemInstruction: ACADEMIC_GRADER_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    let rawResponseText = '';

    try {
      const result = await model.generateContent(userPrompt);
      rawResponseText = result.response.text();
    } catch (primaryErr: unknown) {
      if (isFatalAuthOrClientError(primaryErr)) {
        throw primaryErr;
      }

      try {
        const retryResult = await model.generateContent(userPrompt);
        rawResponseText = retryResult.response.text();
      } catch {
        throw primaryErr;
      }
    }

    const parsedJson: unknown = extractJsonArray(rawResponseText);
    const validatedCritiques = sanitizeAndAlignCritiques(parsedJson, essayText);

    return NextResponse.json(validatedCritiques, { status: 200 });
  } catch (error: unknown) {
    console.error('[ACADEMIC_GRADER_ERROR]:', error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Lỗi không xác định trong quá trình gọi AI Academic Grader.';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}