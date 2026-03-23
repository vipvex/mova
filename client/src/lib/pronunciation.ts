import type { Language } from "./api";

export function normalizeWord(text: string, language: Language): string {
  let normalized = text
    .toLowerCase()
    .replace(/[.,!?;:'"«»\-—–¡¿]/g, "")
    .trim();

  if (language === "russian") {
    normalized = normalized.replace(/ё/g, "е");
  }

  return normalized;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Returns a 0–100 similarity score between the transcription and target word. */
export function calculateSimilarity(
  transcription: string,
  target: string,
  language: Language
): number {
  const normTarget = normalizeWord(target, language);
  if (!normTarget) return 0;

  // Try matching against each word in transcription (Whisper may capture full sentences)
  const words = transcription
    .split(/\s+/)
    .map((w) => normalizeWord(w, language))
    .filter(Boolean);

  // Also try the full normalized transcription
  const normFull = normalizeWord(transcription, language);
  const candidates = [...words, normFull];

  let bestScore = 0;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const maxLen = Math.max(candidate.length, normTarget.length);
    if (maxLen === 0) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }
    const dist = levenshteinDistance(candidate, normTarget);
    const score = Math.round((1 - dist / maxLen) * 100);
    bestScore = Math.max(bestScore, score);
  }

  return Math.max(0, Math.min(100, bestScore));
}

export const SIMILARITY_THRESHOLD = 75;

export function isPronunciationCorrect(score: number, threshold = SIMILARITY_THRESHOLD): boolean {
  return score >= threshold;
}

export function scoreLabel(score: number): string {
  if (score === 100) return "Perfect!";
  if (score >= 90) return "Excellent!";
  if (score >= SIMILARITY_THRESHOLD) return "Great!";
  if (score >= 55) return "Almost there!";
  if (score >= 35) return "Keep trying!";
  return "Let's try again!";
}

// ── Syllable splitting ──────────────────────────────────────────────────────

const RUSSIAN_VOWELS = /[аеёиоуыэюя]/i;
const SPANISH_VOWELS = /[aeiouáéíóú]/i;

function isVowel(char: string, language: Language): boolean {
  return language === "russian"
    ? RUSSIAN_VOWELS.test(char)
    : SPANISH_VOWELS.test(char);
}

/**
 * Splits a word into syllable-like segments for display.
 * Uses a simple vowel-boundary heuristic (same logic as server's chunkWordForPronunciation).
 */
export function splitIntoSyllables(word: string, language: Language): string[] {
  if (!word) return [];

  // Handle spaces: treat as syllable boundaries between individual words
  const parts = word.split(" ");
  if (parts.length > 1) {
    return parts.flatMap((part, i) => {
      const syls = splitIntoSyllables(part, language);
      // Add a space marker as a pseudo-syllable between words
      return i < parts.length - 1 ? [...syls, " "] : syls;
    });
  }

  const chars = word.toLowerCase().split("");
  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < chars.length; i++) {
    currentChunk += word[i]; // Use original char (preserve capitalisation/accents for display)
    const currentIsVowel = isVowel(chars[i], language);
    const nextChar = chars[i + 1];
    const nextIsVowel = nextChar ? isVowel(nextChar, language) : false;

    if (currentIsVowel && nextChar && !nextIsVowel) {
      // Look one more ahead — if the consonant is followed by a vowel, keep it with next syllable
      const afterNext = chars[i + 2];
      const afterNextIsVowel = afterNext ? isVowel(afterNext, language) : false;
      if (afterNextIsVowel) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
    } else if (currentIsVowel && nextIsVowel) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
  }

  if (currentChunk) {
    if (chunks.length > 0) {
      chunks[chunks.length - 1] += currentChunk;
    } else {
      chunks.push(currentChunk);
    }
  }

  return chunks.length > 0 ? chunks : [word];
}
