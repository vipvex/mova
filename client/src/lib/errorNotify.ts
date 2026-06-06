import { toast } from "@/hooks/use-toast";

const NOTIFICATION_SOUND_URL = "/sounds/error-notification.mp3";
const SOUND_DEBOUNCE_MS = 2000;
const NOTIFIED_FLAG = "__notified";

let lastSoundAt = 0;
let notificationAudio: HTMLAudioElement | null = null;

function getNotificationAudio(): HTMLAudioElement {
  if (!notificationAudio) {
    notificationAudio = new Audio(NOTIFICATION_SOUND_URL);
    notificationAudio.preload = "auto";
    notificationAudio.volume = 0.5;
  }
  return notificationAudio;
}

function playNotificationSound(): void {
  const now = Date.now();
  if (now - lastSoundAt < SOUND_DEBOUNCE_MS) return;
  lastSoundAt = now;
  const audio = getNotificationAudio();
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function extractErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  const raw = error instanceof Error ? error.message : String(error);
  // apiRequest throws messages like: "500: {"error":"Failed to generate audio"}"
  const jsonMatch = raw.match(/^\d+:\s*(\{.*\})$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed && typeof parsed.error === "string") return parsed.error;
    } catch {
      // fall through
    }
  }
  return raw;
}

function isAlreadyNotified(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as Record<string, unknown>)[NOTIFIED_FLAG]);
}

export function markErrorNotified(error: unknown): void {
  if (error && typeof error === "object") {
    try {
      (error as Record<string, unknown>)[NOTIFIED_FLAG] = true;
    } catch {
      // some errors are frozen; fine to skip
    }
  }
}

export function notifyError(operation: string, error: unknown): void {
  if (isAlreadyNotified(error)) return;
  const description = extractErrorMessage(error);
  toast({
    variant: "destructive",
    title: `${operation} failed`,
    description,
    duration: 5000,
  });
  playNotificationSound();
  markErrorNotified(error);
}

export async function withErrorNotify<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    notifyError(operation, err);
    throw err;
  }
}
