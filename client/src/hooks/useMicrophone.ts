import { useRef, useCallback, useEffect } from "react";

/**
 * Manages a persistent microphone stream that survives across recordings.
 * The stream is acquired once on first use and only released on unmount,
 * preventing repeated browser permission prompts.
 */
export function useMicrophone() {
  const streamRef = useRef<MediaStream | null>(null);

  const getStream = useCallback(async (): Promise<MediaStream> => {
    // Reuse existing stream if tracks are still live
    if (streamRef.current && streamRef.current.getTracks().every(t => t.readyState === "live")) {
      return streamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Release on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { getStream, releaseStream, streamRef };
}
