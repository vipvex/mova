import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { fetchVoiceConfig } from "@/lib/api";

export type VoiceType = "native" | "child";
export type AudioSpeed = 0.5 | 0.75 | 1.0 | 1.25;

interface Settings {
  voiceType: VoiceType;
  audioSpeed: AudioSpeed;
  musicVolume: number;
}

interface SettingsContextType extends Settings {
  childVoiceEnabled: boolean;
  setVoiceType: (v: VoiceType) => void;
  setAudioSpeed: (s: AudioSpeed) => void;
  setMusicVolume: (v: number) => void;
}

const STORAGE_KEY = "movaSettings";

const defaultSettings: Settings = {
  voiceType: "native",
  audioSpeed: 1.0,
  musicVolume: 0.15,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return defaultSettings;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [childVoiceEnabled, setChildVoiceEnabled] = useState(false);

  useEffect(() => {
    fetchVoiceConfig().then((cfg) => setChildVoiceEnabled(cfg.childVoiceEnabled));
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setVoiceType = useCallback(
    (v: VoiceType) => persist({ ...settings, voiceType: v }),
    [settings, persist]
  );

  const setAudioSpeed = useCallback(
    (s: AudioSpeed) => persist({ ...settings, audioSpeed: s }),
    [settings, persist]
  );

  const setMusicVolume = useCallback(
    (v: number) => persist({ ...settings, musicVolume: Math.max(0, Math.min(1, v)) }),
    [settings, persist]
  );

  return (
    <SettingsContext.Provider value={{ ...settings, childVoiceEnabled, setVoiceType, setAudioSpeed, setMusicVolume }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
