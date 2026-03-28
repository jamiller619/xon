import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../apiFetch.js";
import styles from "./VideoPlayer.module.css";

type AudioTrack = {
  index: number;
  codec: string;
  language?: string;
  title?: string;
};

type SubtitleTrack =
  | {
      type: "embedded";
      index: number;
      codec: string;
      language?: string;
      title?: string;
      label: string;
    }
  | { type: "external"; file: string; language?: string; label: string };

type TracksResponse = {
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
};

interface VideoPlayerProps {
  mediaId: string;
  mimeType?: string;
  onClose: () => void;
}

function browserCanPlay(mimeType: string): boolean {
  const v = document.createElement("video");
  const result = v.canPlayType(mimeType);
  return result === "probably" || result === "maybe";
}

function saveProgress(mediaId: string, position: number, duration: number, completed: boolean) {
  apiFetch(`/api/v1/media/${mediaId}/progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      position: Math.floor(position),
      duration: Math.floor(duration),
      completed,
    }),
  }).catch(() => {
    // best-effort save
  });
}

export default function VideoPlayer({ mediaId, mimeType, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tracks, setTracks] = useState<TracksResponse | null>(null);
  const [selectedSub, setSelectedSub] = useState<string>("none");
  const [selectedAudio, setSelectedAudio] = useState<number>(-1);

  // Determine upfront (before first render) whether HLS is needed
  const [useHls] = useState<boolean>(() => {
    if (!mimeType) return false;
    try {
      return !browserCanPlay(mimeType);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    apiFetch(`/api/v1/media/${mediaId}/tracks`)
      .then((r) => r.json())
      .then((data: TracksResponse) => {
        setTracks(data);
      })
      .catch(() => {
        // tracks unavailable
      });
  }, [mediaId]);

  // Report progress every 10 seconds while playing
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const interval = setInterval(() => {
      if (!video.paused && video.duration > 0) {
        const completed = video.currentTime >= video.duration - 1;
        saveProgress(mediaId, video.currentTime, video.duration, completed);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [mediaId]);

  // HLS setup via hls.js when native playback is not supported
  useEffect(() => {
    if (!useHls) return;
    const video = videoRef.current;
    if (!video) return;

    const hlsUrl = `/api/v1/media/${mediaId}/hls/playlist.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
    // Safari supports HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
    }
  }, [useHls, mediaId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!video) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (video.paused) {
            void video.play();
          } else {
            video.pause();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else {
            void video.requestFullscreen();
          }
          break;
        case "Escape":
          onClose();
          break;
        default:
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Sync selected subtitle track with the video's textTracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncTracks = () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (!track) continue;
        track.mode = track.id === selectedSub ? "showing" : "hidden";
      }
    };

    if (video.readyState >= 1) {
      syncTracks();
    } else {
      video.addEventListener("loadedmetadata", syncTracks, { once: true });
    }
  }, [selectedSub]);

  // Attempt audio track switching (Safari / future browsers)
  useEffect(() => {
    if (selectedAudio < 0) return;
    const video = videoRef.current;
    if (!video) return;
    // HTMLVideoElement.audioTracks is non-standard; access via index signature
    const audioTracks = (
      video as unknown as { audioTracks?: { length: number; [i: number]: { enabled: boolean } } }
    ).audioTracks;
    if (!audioTracks) return;
    for (let i = 0; i < audioTracks.length; i++) {
      const t = audioTracks[i];
      if (t) t.enabled = i === selectedAudio;
    }
  }, [selectedAudio]);

  const externalSubTracks =
    tracks?.subtitleTracks.filter(
      (t): t is Extract<SubtitleTrack, { type: "external" }> => t.type === "external"
    ) ?? [];

  const hasSubtitles = (tracks?.subtitleTracks.length ?? 0) > 0;
  const hasAudio = (tracks?.audioTracks.length ?? 0) > 1;

  return (
    <div className={styles.playerWrapper ?? ""}>
      <button
        type="button"
        className={styles.closeBtn ?? ""}
        onClick={onClose}
        title="Close player"
      >
        ✕
      </button>
      <video
        ref={videoRef}
        className={styles.video ?? ""}
        {...(useHls ? {} : { src: `/api/v1/media/${mediaId}/stream` })}
        controls
        autoPlay
      >
        {externalSubTracks.map((sub) => (
          <track
            key={sub.file}
            id={sub.file}
            kind="subtitles"
            src={`/api/v1/media/${mediaId}/subtitle?file=${encodeURIComponent(sub.file)}`}
            srcLang={sub.language ?? ""}
            label={sub.label}
          />
        ))}
      </video>
      {(hasSubtitles || hasAudio) && (
        <div className={styles.trackControls ?? ""}>
          {hasSubtitles && (
            <label className={styles.trackLabel ?? ""}>
              Subtitles
              <select
                className={styles.trackSelect ?? ""}
                value={selectedSub}
                onChange={(e) => setSelectedSub(e.target.value)}
              >
                <option value="none">Off</option>
                {tracks?.subtitleTracks.map((sub) =>
                  sub.type === "external" ? (
                    <option key={sub.file} value={sub.file}>
                      {sub.label}
                    </option>
                  ) : (
                    <option key={`embedded-${sub.index}`} value={`embedded-${sub.index}`}>
                      {sub.label}
                    </option>
                  )
                )}
              </select>
            </label>
          )}
          {hasAudio && (
            <label className={styles.trackLabel ?? ""}>
              Audio
              <select
                className={styles.trackSelect ?? ""}
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(Number(e.target.value))}
              >
                {tracks?.audioTracks.map((audio, i) => (
                  <option key={audio.index} value={i}>
                    {audio.title ?? audio.language ?? `Track ${i + 1}`} ({audio.codec})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
