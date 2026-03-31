import { describe, expect, it } from "vitest";
import { generateHlsPlaylist, needsTranscoding } from "./transcode.js";

describe("needsTranscoding", () => {
  it("returns false when both codecs are undefined", () => {
    expect(needsTranscoding(undefined, undefined)).toBe(false);
  });

  it("returns false for native H.264 video + AAC audio", () => {
    expect(needsTranscoding("h264", "aac")).toBe(false);
  });

  it("returns false for VP9 video + opus audio", () => {
    expect(needsTranscoding("vp9", "opus")).toBe(false);
  });

  it("returns false for AV1 video + flac audio", () => {
    expect(needsTranscoding("av1", "flac")).toBe(false);
  });

  it("returns true for HEVC (h265) video", () => {
    expect(needsTranscoding("hevc", "aac")).toBe(true);
  });

  it("returns true for unknown video codec", () => {
    expect(needsTranscoding("wmv3", "mp3")).toBe(true);
  });

  it("returns true for non-native audio codec alone", () => {
    expect(needsTranscoding("h264", "ac3")).toBe(true);
  });

  it("returns false for native video with no audio codec", () => {
    expect(needsTranscoding("h264", undefined)).toBe(false);
  });

  it("returns true when video codec is non-native and audio is native", () => {
    expect(needsTranscoding("mpeg4", "aac")).toBe(true);
  });
});

describe("generateHlsPlaylist", () => {
  it("generates a valid m3u8 header", () => {
    const playlist = generateHlsPlaylist(12);
    expect(playlist).toContain("#EXTM3U");
    expect(playlist).toContain("#EXT-X-VERSION:3");
    expect(playlist).toContain("#EXT-X-TARGETDURATION:6");
    expect(playlist).toContain("#EXT-X-MEDIA-SEQUENCE:0");
    expect(playlist).toContain("#EXT-X-ENDLIST");
  });

  it("generates correct number of segments for 12s at 6s per segment", () => {
    const playlist = generateHlsPlaylist(12, 6);
    const segments = playlist.split("\n").filter((l) => l.startsWith("segment-"));
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe("segment-0.ts");
    expect(segments[1]).toBe("segment-1.ts");
  });

  it("generates correct number of segments for 15s at 6s per segment (ceil)", () => {
    const playlist = generateHlsPlaylist(15, 6);
    const segments = playlist.split("\n").filter((l) => l.startsWith("segment-"));
    expect(segments).toHaveLength(3);
  });

  it("last segment has correct trimmed duration", () => {
    const playlist = generateHlsPlaylist(15, 6);
    const lines = playlist.split("\n");
    const lastExtinf = lines.findLast((l) => l.startsWith("#EXTINF:"));
    // Last segment is 15 - 12 = 3 seconds
    expect(lastExtinf).toBe("#EXTINF:3.000,");
  });

  it("uses default segment duration of 6 when not specified", () => {
    const playlist = generateHlsPlaylist(6);
    expect(playlist).toContain("#EXT-X-TARGETDURATION:6");
  });

  it("respects custom segment duration", () => {
    const playlist = generateHlsPlaylist(10, 4);
    expect(playlist).toContain("#EXT-X-TARGETDURATION:4");
    const segments = playlist.split("\n").filter((l) => l.startsWith("segment-"));
    expect(segments).toHaveLength(3); // ceil(10/4)=3
  });
});
