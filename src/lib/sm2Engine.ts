import { SM2QualityRating } from '@/types/database.types';

export interface ISM2EvaluationResult {
  nextInterval: number;
  nextEase: number;
  nextRepetitions: number;
  reviewDate: string;
}

const MIN_EASE_FACTOR = 1.3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Pure Function thực thi thuật toán giãn cách lặp lại SuperMemo-2 (SM-2).
 * Không phụ thuộc thư viện ngoài, đảm bảo tính tất định (Deterministic) 100%.
 *
 * @param quality 0 (Again) | 1 (Hard) | 2 (Good) | 3 (Easy)
 * @param repetitions Số lần ôn tập liên tiếp thành công hiện tại
 * @param easeFactor Hệ số độ dễ hiện tại (mặc định 2.50, tối thiểu 1.30)
 * @param interval Khoảng cách ngày hiện tại
 */
export function evaluateSM2(
  quality: SM2QualityRating,
  repetitions: number,
  easeFactor: number,
  interval: number
): ISM2EvaluationResult {
  const safeRepetitions = Math.max(0, Math.floor(repetitions));
  const safeEase = Math.max(MIN_EASE_FACTOR, Number.isFinite(easeFactor) ? easeFactor : 2.5);
  const safeInterval = Math.max(0, Math.floor(interval));

  // Ánh xạ thang 0..3 sang thang điểm chuẩn SM-2 (0..5) để tính đạo hàm Ease Factor:
  // 0 (Again) -> 1 | 1 (Hard) -> 3 | 2 (Good) -> 4 | 3 (Easy) -> 5
  const mappedGradeMap: Record<SM2QualityRating, number> = {
    0: 1,
    1: 3,
    2: 4,
    3: 5,
  };
  const sm2Grade = mappedGradeMap[quality];

  // Công thức cập nhật Ease Factor nguyên bản của Piotr Wozniak:
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const easeDelta = 0.1 - (5 - sm2Grade) * (0.08 + (5 - sm2Grade) * 0.02);
  const rawNextEase = safeEase + easeDelta;
  const nextEase = Math.max(
    MIN_EASE_FACTOR,
    Math.round(rawNextEase * 100) / 100
  );

  let nextRepetitions: number;
  let nextInterval: number;
  const nowTimestamp = Date.now();
  let reviewDateIso: string;

  if (quality === 0) {
    // Again: Quên hoàn toàn -> Reset chuỗi lặp về 0, hẹn ôn lại sau 10 phút ngay trong phiên
    nextRepetitions = 0;
    nextInterval = 0;
    reviewDateIso = new Date(nowTimestamp + TEN_MINUTES_MS).toISOString();
  } else if (quality === 1) {
    // Hard: Nhớ mang máng hoặc phản xạ chậm -> Tăng nhẹ interval 1.2x (tối thiểu 1 ngày)
    nextRepetitions = safeRepetitions + 1;
    nextInterval = safeInterval === 0 ? 1 : Math.max(1, Math.round(safeInterval * 1.2));
    reviewDateIso = new Date(nowTimestamp + nextInterval * MS_PER_DAY).toISOString();
  } else if (quality === 2) {
    // Good: Nhớ chuẩn xác theo lộ trình chuẩn SM-2 (1 ngày -> 6 ngày -> interval * EF)
    nextRepetitions = safeRepetitions + 1;
    if (safeRepetitions === 0) {
      nextInterval = 1;
    } else if (safeRepetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.max(1, Math.round(safeInterval * nextEase));
    }
    reviewDateIso = new Date(nowTimestamp + nextInterval * MS_PER_DAY).toISOString();
  } else {
    // Easy (quality === 3): Phản xạ tức thì -> Nhảy bậc thưởng 1.3x
    nextRepetitions = safeRepetitions + 1;
    if (safeRepetitions === 0) {
      nextInterval = 4;
    } else if (safeRepetitions === 1) {
      nextInterval = 10;
    } else {
      nextInterval = Math.max(1, Math.round(safeInterval * nextEase * 1.3));
    }
    reviewDateIso = new Date(nowTimestamp + nextInterval * MS_PER_DAY).toISOString();
  }

  return {
    nextInterval,
    nextEase,
    nextRepetitions,
    reviewDate: reviewDateIso,
  };
}