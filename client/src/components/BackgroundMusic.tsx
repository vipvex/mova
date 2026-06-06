import { useEffect, useRef, useState } from "react";
import { Music, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/SettingsContext";

const TRACKS = ["/sounds/bg-music-1.mp3", "/sounds/bg-music-2.mp3"];

function shuffled(): string[] {
  const list = [...TRACKS];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export default function BackgroundMusic() {
  const { musicVolume, setMusicVolume } = useSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<string[]>(shuffled());
  const indexRef = useRef(0);
  const [started, setStarted] = useState(false);

  // Keep the live audio element's volume synced with the user's setting.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume;
  }, [musicVolume]);

  // Browsers block autoplay until the user interacts with the page —
  // wait for the first pointer/key event before starting the playlist.
  useEffect(() => {
    if (started) return;

    const start = () => {
      const audio = new Audio(playlistRef.current[indexRef.current]);
      audio.volume = musicVolume;
      audio.addEventListener("ended", () => {
        indexRef.current = (indexRef.current + 1) % playlistRef.current.length;
        if (indexRef.current === 0) playlistRef.current = shuffled();
        audio.src = playlistRef.current[indexRef.current];
        audio.play().catch(() => {});
      });
      audio.play().catch(() => {});
      audioRef.current = audio;
      setStarted(true);
    };

    const onInteract = () => {
      start();
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("keydown", onInteract);
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, [started, musicVolume]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const muted = musicVolume === 0;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 rounded-full shadow-md"
            aria-label="Background music volume"
            data-testid="button-music-volume"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Music className="w-4 h-4" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-56">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Music volume</span>
              <span className="text-muted-foreground tabular-nums">
                {Math.round(musicVolume * 100)}%
              </span>
            </div>
            <Slider
              value={[Math.round(musicVolume * 100)]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setMusicVolume((v[0] ?? 0) / 100)}
              data-testid="slider-music-volume"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
