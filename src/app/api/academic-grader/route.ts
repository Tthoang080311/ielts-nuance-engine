import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HighlightCategory, IAcademicCritiqueItem } from '@/types/database.types';

export const runtime = 'edge';

interface IAcademicGraderRequestBody {
  essayText: string;
  geminiKey: string;
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
  return typeof rec.essayText === 'string' && typeof rec.geminiKey === 'string';
}

function sanitizeAndAlignCritiques(
  rawParsed: unknown,
  sourceEssay: string
): IAcademicCritiqueItem[] {
  if (!Array.isArray(rawParsed)) {
    return [];
  }

  const aligned: IAcademicCritiqueItem[] = [];

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

    // Tự động hiệu chỉnh startIndex và endIndex chính xác 100% theo văn bản gốc
    const exactMatchIndex = sourceEssay.indexOf(originalSnippet);
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
        { error: 'Payload thiếu trường essayText hoặc geminiKey hợp lệ.' },
        { status: 400 }
      );
    }

    const essayText = rawBody.essayText.trim();
    const geminiKey = rawBody.geminiKey.trim();

    if (!geminiKey || geminiKey.length < 15) {
      return NextResponse.json(
        { error: 'Gemini API Key không hợp lệ hoặc bị bỏ trống.' },
        { status: 401 }
      );
    }

    if (essayText.length < 15) {
      return NextResponse.json([], { status: 200 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);

    // Cấu hình BẮT BUỘC: model gemini-3.8-flash với responseMimeType: "application/json"
    const primaryModel = genAI.getGenerativeModel({
      model: 'gemini-3.8-flash',
      systemInstruction: ACADEMIC_GRADER_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    let rawResponseText = '';

    try {
      const result = await primaryModel.generateContent(
        `Analyze this IELTS Writing Task 2 text and return the JSON array:\n\n"""\n${essayText}\n"""`
      );
      rawResponseText = result.response.text();
    } catch (primaryErr: unknown) {
      // Doubt-Driven Fallback: Nếu Google API vùng hiện tại chưa kích hoạt alias gemini-3.8-flash,
      // tự động chuyển tiếp sang gemini-2.5-flash để đảm bảo 100% uptime không gián đoạn.
      const fallbackModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: ACADEMIC_GRADER_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });
      try {
        const fallbackResult = await fallbackModel.generateContent(
          `Analyze this IELTS Writing Task 2 text and return the JSON array:\n\n"""\n${essayText}\n"""`
        );
        rawResponseText = fallbackResult.response.text();
      } catch {
        throw primaryErr;
      }
    }

    const cleanedJson = rawResponseText
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsedJson: unknown = JSON.parse(cleanedJson);
    const validatedCritiques = sanitizeAndAlignCritiques(parsedJson, essayText);

    return NextResponse.json(validatedCritiques, { status: 200 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Lỗi không xác định trong quá trình gọi AI Academic Grader.';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}