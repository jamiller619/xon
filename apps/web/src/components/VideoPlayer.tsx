import { useEffect, useRef } from "react";
import styles from "./VideoPlayer.module.css";

interface VideoPlayerProps {
  mediaId: string;
  onClose: () => void;
}

export default function VideoPlayer({ mediaId, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

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
      {/* biome-ignore lint/a11y/useMediaCaption: captions are loaded dynamically by browser from stream */}
      <video
        ref={videoRef}
        className={styles.video ?? ""}
        src={`/api/v1/media/${mediaId}/stream`}
        controls
        autoPlay
      />
    </div>
  );
}
