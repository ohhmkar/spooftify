import type { Song } from "./api";

// Minimal slice of the YouTube IFrame API we use
export type YTPlayer = {
  loadVideoById(id: string): void; playVideo(): void; pauseVideo(): void; seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; setVolume(v: number): void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReady: Promise<void> | undefined;
export const loadYT = () =>
  (ytReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.append(s);
  }));

// the 30 s iTunes preview stands in when YouTube cannot give us the song (no API key, daily quota used up, not embeddable)
export const previewUrl = (s: Song) => (s.audio_file && /^https?:\/\//.test(s.audio_file) && !s.audio_file.includes("youtube.com") ? s.audio_file : undefined);
