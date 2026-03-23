import { useState, useEffect, useRef } from "react";

/**
 * Highlights syllables one at a time as audio plays.
 * Uses time-based estimation: duration / numSyllables per syllable.
 *
 * @param syllables - Array of syllable strings for the current word
 * @param audioUrl  - The URL of the audio currently being played (null = not playing)
 * @param isPlaying - Whether audio is actively playing right now
 */
export function useSyllableHighlight(
  syllables: string[],
  audioUrl: string | null,
  isPlaying: boolean
): { activeSyllableIndex: number | null } {
  const [activeSyllableIndex, setActiveSyllableIndex] = useState<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear all scheduled timers
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    if (!isPlaying || !audioUrl || syllables.length === 0) {
      clearTimers();
      setActiveSyllableIndex(null);
      return;
    }

    // Use a background Audio element to measure duration, then schedule highlights
    const probe = new Audio(audioUrl);

    const schedule = (duration: number) => {
      clearTimers();
      const msPerSyllable = (duration * 1000 * 0.9) / syllables.length;

      syllables.forEach((_, i) => {
        const t = setTimeout(() => {
          setActiveSyllableIndex(i);
        }, i * msPerSyllable);
        timersRef.current.push(t);
      });

      // Clear highlight shortly after audio ends
      const clearT = setTimeout(
        () => setActiveSyllableIndex(null),
        duration * 1000 + 200
      );
      timersRef.current.push(clearT);
    };

    const onMeta = () => {
      if (probe.duration && isFinite(probe.duration)) {
        schedule(probe.duration);
      } else {
        // Fallback: 300ms per syllable
        schedule((syllables.length * 300) / 1000);
      }
      probe.removeEventListener("loadedmetadata", onMeta);
    };

    probe.addEventListener("loadedmetadata", onMeta);

    // If metadata fires synchronously (cached audio), onMeta may not fire — handle via canplaythrough
    probe.addEventListener("canplaythrough", () => {
      if (timersRef.current.length === 0) {
        onMeta();
      }
    }, { once: true });

    // Start loading (don't play — just probe duration)
    probe.load();

    // Fallback timeout in case metadata never loads
    const fallback = setTimeout(() => {
      if (timersRef.current.length === 0) {
        schedule((syllables.length * 300) / 1000);
      }
    }, 800);

    return () => {
      clearTimeout(fallback);
      probe.removeEventListener("loadedmetadata", onMeta);
      clearTimers();
      setActiveSyllableIndex(null);
    };
  }, [isPlaying, audioUrl, syllables.join("|")]);

  return { activeSyllableIndex };
}
