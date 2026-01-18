// SM-2 Spaced Repetition Algorithm implementation
// Based on SuperMemo 2 algorithm

export interface SM2Result {
  easeFactor: number;  // stored as integer (2.5 = 250)
  interval: number;    // days until next review
  repetitions: number;
  nextReviewDate: Date;
}

/**
 * Calculate the next review date using SM-2 algorithm
 * @param quality - Quality of response (0-5)
 *   0 - Complete blackout
 *   1 - Incorrect response, but remembered upon seeing correct answer
 *   2 - Incorrect response, but correct answer seemed easy to recall
 *   3 - Correct response, but with significant difficulty
 *   4 - Correct response, after some hesitation
 *   5 - Correct response with perfect recall
 * @param currentEaseFactor - Current ease factor (as integer, 250 = 2.5)
 * @param currentInterval - Current interval in days
 * @param currentRepetitions - Current number of repetitions
 */
export function calculateSM2(
  quality: number,
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number
): SM2Result {
  // Clamp quality to valid range
  quality = Math.max(0, Math.min(5, quality));
  
  let newEaseFactor = currentEaseFactor;
  let newInterval: number;
  let newRepetitions: number;
  
  if (quality >= 3) {
    // Correct response - use child-friendly spaced intervals
    // After review at rep 0: next review tomorrow (interval=1)
    // After review at rep 1: next review in 2 days (interval=2)
    // After review at rep 2+: use ease factor calculation
    if (currentRepetitions === 0) {
      newInterval = 1; // Tomorrow
    } else if (currentRepetitions === 1) {
      newInterval = 2; // 2 days
    } else {
      // Convert easeFactor from integer to decimal for calculation
      const ef = currentEaseFactor / 100;
      newInterval = Math.round(currentInterval * ef);
      // Ensure minimum interval of 3 days after initial reps
      newInterval = Math.max(3, newInterval);
    }
    newRepetitions = currentRepetitions + 1;
  } else {
    // Incorrect response - review again today (interval=0)
    newRepetitions = 0;
    newInterval = 0;
  }
  
  // Update ease factor
  // EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  const efChange = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  newEaseFactor = Math.round(currentEaseFactor + efChange * 100);
  
  // Ease factor should never go below 1.3 (130)
  newEaseFactor = Math.max(130, newEaseFactor);
  
  // Calculate next review date
  const nextReviewDate = new Date();
  if (newInterval === 0) {
    // Instant review - available now
    // No change needed, date is already "now"
  } else {
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
  }
  
  return {
    easeFactor: newEaseFactor,
    interval: newInterval,
    repetitions: newRepetitions,
    nextReviewDate,
  };
}

/**
 * Simplified quality mapping for child-friendly UI
 * "Still Learning" = quality 2 (incorrect, needs more practice)
 * "I Know It!" = quality 4 (correct with some hesitation)
 */
export function mapButtonToQuality(knowsIt: boolean): number {
  return knowsIt ? 4 : 2;
}

/**
 * Get initial values for a newly learned word
 */
export function getInitialProgress(): {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
} {
  const nextReviewDate = new Date(); // Available for review immediately
  
  return {
    easeFactor: 250, // 2.5
    interval: 0,
    repetitions: 0,
    nextReviewDate,
  };
}
