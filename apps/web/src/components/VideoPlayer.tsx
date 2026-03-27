import { useEffect, useRef, useState } from "react";
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
  onClose: () => void;
}

export default function VideoPlayer({ mediaId, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tracks, setTracks] = useState<TracksResponse | null>(null);
  const [selectedSub, setSelectedSub] = useState<string>("none");
  const [selectedAudio, setSelectedAudio] = useState<number>(-1);

  useEffect(() => {
    fetch(`/api/v1/media/${mediaId}/tracks`)
      .then((r) => r.json())
      .then((data: TracksResponse) => {
        setTracks(data);
      })
      .catch(() => {
        // tracks unavailable
      });
  }, [mediaId]);

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
      {/* biome-ignore lint/a11y/useMediaCaption: captions are loaded dynamically via <track> elements */}
      <video
        ref={videoRef}
        className={styles.video ?? ""}
        src={`/api/v1/media/${mediaId}/stream`}
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
