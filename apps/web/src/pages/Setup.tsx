import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/index.js";
import styles from "./Setup.module.css";

const ALL_MEDIA_TYPES: { label: string; emoji: string }[] = [
  { label: "Movies", emoji: "🎬" },
  { label: "TV Shows", emoji: "📺" },
  { label: "Clips", emoji: "🎞️" },
  { label: "Music", emoji: "🎵" },
  { label: "Audiobooks", emoji: "🎧" },
  { label: "Audio Clips", emoji: "🔊" },
  { label: "Podcasts", emoji: "🎙️" },
  { label: "Pictures", emoji: "🖼️" },
  { label: "Images", emoji: "📷" },
  { label: "Textures", emoji: "🎨" },
  { label: "Home Videos", emoji: "📹" },
  { label: "Games", emoji: "🎮" },
  { label: "Interactive Media", emoji: "💻" },
  { label: "Documents", emoji: "📄" },
  { label: "Web Media", emoji: "🌐" },
  { label: "Design Files", emoji: "✏️" },
  { label: "3D Models", emoji: "🧊" },
  { label: "Archives", emoji: "🗜️" },
  { label: "Fonts", emoji: "🔤" },
  { label: "Icons", emoji: "🔷" },
];

type Step = 1 | 2 | 3;

export default function Setup() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Step 1 state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Step 2 state
  const [libraryName, setLibraryName] = useState("");
  const [mediaTypes, setMediaTypes] = useState<string[]>([]);
  const [sourcePath, setSourcePath] = useState("");

  // Wizard state
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [scanStarted, setScanStarted] = useState(false);

  // Check if setup already complete — redirect to login
  useEffect(() => {
    fetch("/api/v1/auth/setup-status")
      .then((r) => r.json())
      .then((data: { setupComplete: boolean }) => {
        if (data.setupComplete) {
          navigate("/login", { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate]);

  function toggleMediaType(type: string) {
    setMediaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function handleBrowse() {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("webkitdirectory", "");
      fileInputRef.current.click();
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const nativeFile = file as File & { path?: string };
    if (nativeFile.path) {
      // Electron: file.path is the full OS path; strip filename to get directory
      const lastSlash = Math.max(
        nativeFile.path.lastIndexOf("/"),
        nativeFile.path.lastIndexOf("\\")
      );
      setSourcePath(lastSlash > 0 ? nativeFile.path.slice(0, lastSlash) : nativeFile.path);
    }
    e.target.value = "";
  }

  async function handleStep1(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        if (res.status === 409) {
          navigate("/login", { replace: true });
          return;
        }
        setError(body.error ?? "Setup failed");
        return;
      }
      const body = (await res.json()) as { accessToken: string };
      const [, payloadB64] = body.accessToken.split(".");
      const payload = JSON.parse(atob(payloadB64 ?? "")) as {
        username: string;
        role: string;
      };
      setAuth(body.accessToken, payload.username, payload.role);
      setStep(2);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Create library
      const libRes = await fetch("/api/v1/libraries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: libraryName,
          allowedMediaTypes: mediaTypes,
        }),
      });
      if (!libRes.ok) {
        const body = (await libRes.json()) as { error?: string };
        setError(body.error ?? "Failed to create library");
        return;
      }
      const lib = (await libRes.json()) as { id: string };

      // Add data source
      const srcRes = await fetch(`/api/v1/libraries/${lib.id}/sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ type: "local", path: sourcePath.trim(), recursive: true }),
      });
      if (!srcRes.ok) {
        const body = (await srcRes.json()) as { error?: string };
        setError(body.error ?? "Failed to add data source");
        return;
      }

      setLibraryId(lib.id);
      setStep(3);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    if (!libraryId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/libraries/${libraryId}/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok && res.status !== 409) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to start scan");
        return;
      }
      setScanStarted(true);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleFinish() {
    navigate("/", { replace: true });
  }

  return (
    <div className={styles.page ?? ""}>
      <div className={styles.card ?? ""}>
        <div className={styles.logo ?? ""}>
          <span className={styles.logoText ?? ""}>xon</span>
        </div>
        <div className={styles.steps ?? ""}>
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`${styles.stepDot ?? ""} ${step === s ? (styles.active ?? "") : ""} ${step > s ? (styles.done ?? "") : ""}`}
            >
              {s}
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 className={styles.heading ?? ""}>Welcome to Xon</h1>
            <p className={styles.subtitle ?? ""}>Create your admin account to get started.</p>
            <form className={styles.form ?? ""} onSubmit={handleStep1}>
              <div className={styles.field ?? ""}>
                <label htmlFor="displayName" className={styles.label ?? ""}>
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={styles.input ?? ""}
                  required
                />
              </div>
              <div className={styles.field ?? ""}>
                <label htmlFor="username" className={styles.label ?? ""}>
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={styles.input ?? ""}
                  required
                />
              </div>
              <div className={styles.field ?? ""}>
                <label htmlFor="password" className={styles.label ?? ""}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input ?? ""}
                  required
                  minLength={8}
                />
              </div>
              {error && <div className={styles.error ?? ""}>{error}</div>}
              <button type="submit" className={styles.button ?? ""} disabled={loading}>
                {loading ? "Creating account…" : "Create Admin Account"}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className={styles.heading ?? ""}>Create Your First Library</h1>
            <p className={styles.subtitle ?? ""}>
              Set up a media library to organize your content.
            </p>
            <form className={styles.form ?? ""} onSubmit={handleStep2}>
              <div className={styles.field ?? ""}>
                <label htmlFor="libraryName" className={styles.label ?? ""}>
                  Library Name
                </label>
                <input
                  id="libraryName"
                  type="text"
                  value={libraryName}
                  onChange={(e) => setLibraryName(e.target.value)}
                  className={styles.input ?? ""}
                  required
                  placeholder="e.g. Movies, Music, Photos"
                />
              </div>
              <div className={styles.field ?? ""}>
                <span className={styles.label ?? ""}>Media Types</span>
                <div className={styles.checkGrid ?? ""}>
                  {ALL_MEDIA_TYPES.map(({ label, emoji }) => (
                    <label key={label} className={styles.checkLabel ?? ""}>
                      <input
                        type="checkbox"
                        checked={mediaTypes.includes(label)}
                        onChange={() => toggleMediaType(label)}
                      />
                      <span>{emoji}</span>
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.field ?? ""}>
                <label htmlFor="sourcePath" className={styles.label ?? ""}>
                  Media Folder Path
                </label>
                <div className={styles.inputRow ?? ""}>
                  <input
                    id="sourcePath"
                    type="text"
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                    className={styles.input ?? ""}
                    placeholder="/mnt/media or C:\Media"
                    required
                  />
                  <button
                    type="button"
                    className={styles.browseButton ?? ""}
                    onClick={handleBrowse}
                  >
                    Browse
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileInputChange}
                />
              </div>
              {error && <div className={styles.error ?? ""}>{error}</div>}
              <div className={styles.buttonRow ?? ""}>
                <button
                  type="button"
                  className={styles.buttonSecondary ?? ""}
                  onClick={() => setStep(3)}
                  disabled={loading}
                >
                  Skip
                </button>
                <button type="submit" className={styles.button ?? ""} disabled={loading}>
                  {loading ? "Creating library…" : "Create Library"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className={styles.heading ?? ""}>
              {scanStarted ? "Setup Complete!" : "Scan Your Library"}
            </h1>
            {scanStarted ? (
              <>
                <p className={styles.subtitle ?? ""}>
                  Your library scan is running in the background. Xon is ready to use.
                </p>
                {error && <div className={styles.error ?? ""}>{error}</div>}
                <button type="button" className={styles.button ?? ""} onClick={handleFinish}>
                  Go to Dashboard
                </button>
              </>
            ) : (
              <>
                <p className={styles.subtitle ?? ""}>
                  {libraryId
                    ? "Start an initial scan to index your media files."
                    : "Your admin account is ready. You can add libraries and scan media from the admin panel."}
                </p>
                {error && <div className={styles.error ?? ""}>{error}</div>}
                <div className={styles.buttonRow ?? ""}>
                  <button
                    type="button"
                    className={styles.buttonSecondary ?? ""}
                    onClick={handleFinish}
                  >
                    Skip
                  </button>
                  {libraryId && (
                    <button
                      type="button"
                      className={styles.button ?? ""}
                      disabled={loading}
                      onClick={handleScan}
                    >
                      {loading ? "Starting scan…" : "Start Scan"}
                    </button>
                  )}
                  {!libraryId && (
                    <button type="button" className={styles.button ?? ""} onClick={handleFinish}>
                      Go to Dashboard
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
