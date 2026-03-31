import { useEffect, useState } from 'react';
import { apiFetch } from '../apiFetch.js';
import styles from './AdminBackup.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackupTarget {
  id: string;
  name: string;
  type: 'local' | 'network' | 'plugin';
  config: string;
  enabled: boolean;
  removeDeleted: boolean;
  schedule: string | null;
  retentionKeepCount: number | null;
  retentionKeepDays: number | null;
  nextScheduledAt: string | null;
  createdAt: string;
}

interface BackupJob {
  id: string;
  targetId: string;
  scope: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalFiles: number;
  copiedFiles: number;
  skippedFiles: number;
  errors: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface VerifyJob {
  id: string;
  targetId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  missingFiles: number;
  failedItems: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'completed':
      return styles.badgeGreen ?? '';
    case 'running':
    case 'pending':
      return styles.badgeBlue ?? '';
    case 'failed':
      return styles.badgeRed ?? '';
    default:
      return styles.badge ?? '';
  }
}

// ---------------------------------------------------------------------------
// Subcomponent: Target form modal
// ---------------------------------------------------------------------------

interface TargetFormState {
  name: string;
  type: 'local' | 'network' | 'plugin';
  destPath: string;
  mountPath: string;
  pluginId: string;
  enabled: boolean;
  removeDeleted: boolean;
}

const EMPTY_TARGET_FORM: TargetFormState = {
  name: '',
  type: 'local',
  destPath: '',
  mountPath: '',
  pluginId: '',
  enabled: true,
  removeDeleted: false,
};

function buildConfig(form: TargetFormState): Record<string, string> {
  if (form.type === 'local') return { destPath: form.destPath };
  if (form.type === 'network') return { mountPath: form.mountPath };
  return { pluginId: form.pluginId };
}

function parseConfig(type: string, config: string): Partial<TargetFormState> {
  try {
    const cfg = JSON.parse(config) as Record<string, string>;
    if (type === 'local') return { destPath: cfg.destPath ?? '' };
    if (type === 'network') return { mountPath: cfg.mountPath ?? '' };
    if (type === 'plugin') return { pluginId: cfg.pluginId ?? '' };
  } catch {
    // ignore
  }
  return {};
}

interface TargetModalProps {
  initial: TargetFormState;
  title: string;
  onSave: (form: TargetFormState) => Promise<void>;
  onClose: () => void;
  error: string;
}

function TargetModal({
  initial,
  title,
  onSave,
  onClose,
  error,
}: TargetModalProps) {
  const [form, setForm] = useState<TargetFormState>(initial);
  const [saving, setSaving] = useState(false);

  function set(patch: Partial<TargetFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <h2>{title}</h2>

        <label>
          Name
          <input
            type="text"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="My Backup Target"
          />
        </label>

        <label>
          Type
          <select
            value={form.type}
            onChange={(e) =>
              set({ type: e.target.value as TargetFormState['type'] })
            }
          >
            <option value="local">Local</option>
            <option value="network">Network (mount)</option>
            <option value="plugin">Plugin</option>
          </select>
        </label>

        {form.type === 'local' && (
          <label>
            Destination Path
            <input
              type="text"
              value={form.destPath}
              onChange={(e) => set({ destPath: e.target.value })}
              placeholder="/mnt/backup"
            />
          </label>
        )}

        {form.type === 'network' && (
          <label>
            Mount Path
            <input
              type="text"
              value={form.mountPath}
              onChange={(e) => set({ mountPath: e.target.value })}
              placeholder="/mnt/nas/backup"
            />
          </label>
        )}

        {form.type === 'plugin' && (
          <label>
            Plugin ID
            <input
              type="text"
              value={form.pluginId}
              onChange={(e) => set({ pluginId: e.target.value })}
              placeholder="my-backup-plugin"
            />
          </label>
        )}

        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Enabled
        </label>

        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={form.removeDeleted}
            onChange={(e) => set({ removeDeleted: e.target.checked })}
          />
          Remove deleted files from backup destination
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.modalActions}>
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponent: Schedule modal
// ---------------------------------------------------------------------------

interface ScheduleForm {
  schedule: string;
  retentionKeepCount: string;
  retentionKeepDays: string;
}

interface ScheduleModalProps {
  targetId: string;
  initial: ScheduleForm;
  onSave: (targetId: string, form: ScheduleForm) => Promise<void>;
  onClose: () => void;
  error: string;
}

function ScheduleModal({
  targetId,
  initial,
  onSave,
  onClose,
  error,
}: ScheduleModalProps) {
  const [form, setForm] = useState<ScheduleForm>(initial);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(targetId, form);
    setSaving(false);
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <h2>Edit Schedule</h2>

        <label>
          Cron Expression
          <input
            type="text"
            placeholder="e.g. 0 2 * * * (daily at 2am)"
            value={form.schedule}
            onChange={(e) =>
              setForm((f) => ({ ...f, schedule: e.target.value }))
            }
          />
        </label>

        <label>
          Retention: keep N most recent jobs
          <input
            type="number"
            min={0}
            placeholder="e.g. 10"
            value={form.retentionKeepCount}
            onChange={(e) =>
              setForm((f) => ({ ...f, retentionKeepCount: e.target.value }))
            }
          />
        </label>

        <label>
          Retention: keep jobs for N days
          <input
            type="number"
            min={0}
            placeholder="e.g. 30"
            value={form.retentionKeepDays}
            onChange={(e) =>
              setForm((f) => ({ ...f, retentionKeepDays: e.target.value }))
            }
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.modalActions}>
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponent: Backup trigger modal
// ---------------------------------------------------------------------------

interface BackupScopeForm {
  targetId: string;
  scopeAll: boolean;
  libraryIds: string;
  mediaTypes: string;
  itemIds: string;
}

interface BackupTriggerModalProps {
  targets: BackupTarget[];
  onTrigger: (form: BackupScopeForm) => Promise<void>;
  onClose: () => void;
  error: string;
}

function BackupTriggerModal({
  targets,
  onTrigger,
  onClose,
  error,
}: BackupTriggerModalProps) {
  const [form, setForm] = useState<BackupScopeForm>({
    targetId: targets[0]?.id ?? '',
    scopeAll: true,
    libraryIds: '',
    mediaTypes: '',
    itemIds: '',
  });
  const [running, setRunning] = useState(false);

  function set(patch: Partial<BackupScopeForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleTrigger() {
    setRunning(true);
    await onTrigger(form);
    setRunning(false);
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <h2>Trigger Backup</h2>

        <label>
          Backup Target
          <select
            value={form.targetId}
            onChange={(e) => set({ targetId: e.target.value })}
          >
            {targets
              .filter((t) => t.enabled)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type})
                </option>
              ))}
          </select>
        </label>

        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={form.scopeAll}
            onChange={(e) => set({ scopeAll: e.target.checked })}
          />
          Backup all media
        </label>

        {!form.scopeAll && (
          <>
            <label>
              Library IDs (comma-separated)
              <input
                type="text"
                value={form.libraryIds}
                onChange={(e) => set({ libraryIds: e.target.value })}
                placeholder="lib-id-1, lib-id-2"
              />
            </label>

            <label>
              Media Types (comma-separated)
              <input
                type="text"
                value={form.mediaTypes}
                onChange={(e) => set({ mediaTypes: e.target.value })}
                placeholder="movie, tvshow"
              />
            </label>

            <label>
              Item IDs (comma-separated)
              <input
                type="text"
                value={form.itemIds}
                onChange={(e) => set({ itemIds: e.target.value })}
                placeholder="item-id-1, item-id-2"
              />
            </label>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.modalActions}>
          <button type="button" onClick={handleTrigger} disabled={running}>
            {running ? 'Starting…' : 'Start Backup'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponent: Verify results modal
// ---------------------------------------------------------------------------

interface VerifyResultsModalProps {
  job: VerifyJob;
  targetName: string;
  onClose: () => void;
}

function VerifyResultsModal({
  job,
  targetName,
  onClose,
}: VerifyResultsModalProps) {
  type FailedItem = { filePath: string; reason: string };
  let failedItems: FailedItem[] = [];
  try {
    failedItems = JSON.parse(job.failedItems) as FailedItem[];
  } catch {
    // ignore
  }

  return (
    <div className={styles.modal}>
      <div className={`${styles.modalContent} ${styles.modalWide}`}>
        <h2>Verify Results — {targetName}</h2>

        <div className={styles.verifyStats}>
          <div className={styles.verifyStat}>
            <span className={styles.verifyStatLabel}>Total</span>
            <span className={styles.verifyStatValue}>{job.totalFiles}</span>
          </div>
          <div className={styles.verifyStat}>
            <span className={styles.verifyStatLabel}>Passed</span>
            <span className={`${styles.verifyStatValue} ${styles.colorGreen}`}>
              {job.passedFiles}
            </span>
          </div>
          <div className={styles.verifyStat}>
            <span className={styles.verifyStatLabel}>Failed</span>
            <span className={`${styles.verifyStatValue} ${styles.colorRed}`}>
              {job.failedFiles}
            </span>
          </div>
          <div className={styles.verifyStat}>
            <span className={styles.verifyStatLabel}>Missing</span>
            <span className={`${styles.verifyStatValue} ${styles.colorYellow}`}>
              {job.missingFiles}
            </span>
          </div>
        </div>

        <p className={styles.verifyMeta}>
          Status:{' '}
          <span className={`${styles.badge} ${statusBadge(job.status)}`}>
            {job.status}
          </span>
          &nbsp;&nbsp; Duration:{' '}
          {formatDuration(job.startedAt, job.completedAt)}
        </p>

        {failedItems.length > 0 && (
          <>
            <h3 className={styles.failedHeader}>Failed / Missing Files</h3>
            <div className={styles.failedList}>
              {failedItems.map((item, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list
                <div key={i} className={styles.failedItem}>
                  <code>{item.filePath}</code>
                  <span className={styles.failedReason}>{item.reason}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className={styles.modalActions}>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ModalState =
  | { kind: 'none' }
  | { kind: 'addTarget' }
  | { kind: 'editTarget'; target: BackupTarget }
  | { kind: 'deleteConfirm'; target: BackupTarget }
  | { kind: 'schedule'; target: BackupTarget }
  | { kind: 'triggerBackup' }
  | { kind: 'verifyResults'; job: VerifyJob; targetName: string };

export default function AdminBackup() {
  const [targets, setTargets] = useState<BackupTarget[]>([]);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [verifyJobs, setVerifyJobs] = useState<VerifyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [modalError, setModalError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [tRes, jRes, vRes] = await Promise.all([
        apiFetch('/api/v1/admin/backup/targets'),
        apiFetch('/api/v1/admin/backup/media/jobs'),
        apiFetch('/api/v1/admin/backup/verify/jobs'),
      ]);
      if (tRes.ok) setTargets((await tRes.json()) as BackupTarget[]);
      if (jRes.ok) setJobs((await jRes.json()) as BackupJob[]);
      if (vRes.ok) setVerifyJobs((await vRes.json()) as VerifyJob[]);
    } finally {
      setLoading(false);
    }
  }

  function targetName(id: string): string {
    return targets.find((t) => t.id === id)?.name ?? id;
  }

  // -- Target CRUD --

  async function handleAddTarget(form: TargetFormState) {
    setModalError('');
    const res = await apiFetch('/api/v1/admin/backup/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        config: buildConfig(form),
        enabled: form.enabled,
        removeDeleted: form.removeDeleted,
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setModalError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setModal({ kind: 'none' });
    await loadAll();
  }

  async function handleEditTarget(form: TargetFormState) {
    if (modal.kind !== 'editTarget') return;
    setModalError('');
    const res = await apiFetch(
      `/api/v1/admin/backup/targets/${modal.target.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          config: buildConfig(form),
          enabled: form.enabled,
          removeDeleted: form.removeDeleted,
        }),
      },
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setModalError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setModal({ kind: 'none' });
    await loadAll();
  }

  async function handleDeleteTarget(target: BackupTarget) {
    setModalError('');
    const res = await apiFetch(`/api/v1/admin/backup/targets/${target.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setActionError(data.error ?? `HTTP ${res.status}`);
    }
    setModal({ kind: 'none' });
    await loadAll();
  }

  // -- Schedule --

  async function handleSaveSchedule(targetId: string, form: ScheduleForm) {
    setModalError('');
    const body: Record<string, unknown> = {
      schedule: form.schedule || null,
      retentionKeepCount:
        form.retentionKeepCount !== ''
          ? Number.parseInt(form.retentionKeepCount, 10)
          : null,
      retentionKeepDays:
        form.retentionKeepDays !== ''
          ? Number.parseInt(form.retentionKeepDays, 10)
          : null,
    };
    const res = await apiFetch(
      `/api/v1/admin/backup/targets/${targetId}/schedule`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setModalError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setModal({ kind: 'none' });
    await loadAll();
  }

  // -- Backup trigger --

  async function handleTriggerBackup(form: BackupScopeForm) {
    setModalError('');

    const scope: Record<string, unknown> = {};
    if (form.scopeAll) {
      scope.all = true;
    } else {
      if (form.libraryIds.trim()) {
        scope.libraryIds = form.libraryIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (form.mediaTypes.trim()) {
        scope.mediaTypes = form.mediaTypes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (form.itemIds.trim()) {
        scope.itemIds = form.itemIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    const res = await apiFetch('/api/v1/admin/backup/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: form.targetId, scope }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setModalError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setModal({ kind: 'none' });
    await loadAll();
  }

  // -- Verify --

  async function handleVerify(target: BackupTarget) {
    setActionError('');
    const res = await apiFetch(`/api/v1/admin/backup/verify/${target.id}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setActionError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    await loadAll();
  }

  function showVerifyResults(targetId: string) {
    const job = verifyJobs.find((j) => j.targetId === targetId);
    if (!job) return;
    setModal({ kind: 'verifyResults', job, targetName: targetName(targetId) });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) return <div className={styles.page}>Loading…</div>;

  return (
    <div className={styles.page}>
      <h1>Backup</h1>

      {actionError && <p className={styles.error}>{actionError}</p>}

      {/* ------------------------------------------------------------------ */}
      {/* Backup Targets                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Backup Targets</h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => {
                setModalError('');
                setModal({ kind: 'triggerBackup' });
              }}
            >
              Trigger Backup
            </button>
            <button
              type="button"
              onClick={() => {
                setModalError('');
                setModal({ kind: 'addTarget' });
              }}
            >
              Add Target
            </button>
          </div>
        </div>

        {targets.length === 0 ? (
          <p className={styles.empty}>No backup targets configured.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Enabled</th>
                <th>Schedule</th>
                <th>Next Run</th>
                <th>Retention</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => {
                const latestVerify = verifyJobs.find(
                  (j) => j.targetId === target.id,
                );
                return (
                  <tr key={target.id}>
                    <td>{target.name}</td>
                    <td>{target.type}</td>
                    <td>{target.enabled ? 'Yes' : 'No'}</td>
                    <td>
                      <code>{target.schedule ?? '—'}</code>
                    </td>
                    <td>{formatDate(target.nextScheduledAt)}</td>
                    <td>
                      {target.retentionKeepCount !== null
                        ? `Keep ${target.retentionKeepCount} jobs`
                        : target.retentionKeepDays !== null
                          ? `Keep ${target.retentionKeepDays} days`
                          : '—'}
                    </td>
                    <td className={styles.actions}>
                      <button
                        type="button"
                        onClick={() => {
                          setModalError('');
                          setModal({ kind: 'editTarget', target });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModalError('');
                          setModal({ kind: 'schedule', target });
                        }}
                      >
                        Schedule
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerify(target)}
                        disabled={!target.enabled}
                        title={
                          !target.enabled
                            ? 'Target is disabled'
                            : 'Run integrity check'
                        }
                      >
                        Verify
                      </button>
                      {latestVerify && (
                        <button
                          type="button"
                          className={styles.btnSmall}
                          onClick={() => showVerifyResults(target.id)}
                        >
                          Results
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => {
                          setModalError('');
                          setModal({ kind: 'deleteConfirm', target });
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Backup History                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Backup History</h2>
          <button type="button" onClick={loadAll}>
            Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <p className={styles.empty}>No backup jobs yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Target</th>
                <th>Status</th>
                <th>Total</th>
                <th>Copied</th>
                <th>Skipped</th>
                <th>Errors</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                let errorCount = 0;
                try {
                  errorCount = (JSON.parse(job.errors) as string[]).length;
                } catch {
                  // ignore
                }
                return (
                  <tr key={job.id}>
                    <td>{targetName(job.targetId)}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${statusBadge(job.status)}`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td>{job.totalFiles}</td>
                    <td>{job.copiedFiles}</td>
                    <td>{job.skippedFiles}</td>
                    <td className={errorCount > 0 ? styles.colorRed : ''}>
                      {errorCount}
                    </td>
                    <td>{formatDuration(job.startedAt, job.completedAt)}</td>
                    <td>{formatDate(job.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Modals                                                               */}
      {/* ------------------------------------------------------------------ */}

      {modal.kind === 'addTarget' && (
        <TargetModal
          title="Add Backup Target"
          initial={EMPTY_TARGET_FORM}
          onSave={handleAddTarget}
          onClose={() => setModal({ kind: 'none' })}
          error={modalError}
        />
      )}

      {modal.kind === 'editTarget' && (
        <TargetModal
          title="Edit Backup Target"
          initial={{
            ...EMPTY_TARGET_FORM,
            ...parseConfig(modal.target.type, modal.target.config),
            name: modal.target.name,
            type: modal.target.type,
            enabled: modal.target.enabled,
            removeDeleted: modal.target.removeDeleted,
          }}
          onSave={handleEditTarget}
          onClose={() => setModal({ kind: 'none' })}
          error={modalError}
        />
      )}

      {modal.kind === 'deleteConfirm' && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Delete Target</h2>
            <p>
              Delete backup target <strong>{modal.target.name}</strong>? This
              will also remove all associated jobs and file state.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => handleDeleteTarget(modal.target)}
              >
                Delete
              </button>
              <button type="button" onClick={() => setModal({ kind: 'none' })}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modal.kind === 'schedule' && (
        <ScheduleModal
          targetId={modal.target.id}
          initial={{
            schedule: modal.target.schedule ?? '',
            retentionKeepCount:
              modal.target.retentionKeepCount !== null
                ? String(modal.target.retentionKeepCount)
                : '',
            retentionKeepDays:
              modal.target.retentionKeepDays !== null
                ? String(modal.target.retentionKeepDays)
                : '',
          }}
          onSave={handleSaveSchedule}
          onClose={() => setModal({ kind: 'none' })}
          error={modalError}
        />
      )}

      {modal.kind === 'triggerBackup' && (
        <BackupTriggerModal
          targets={targets}
          onTrigger={handleTriggerBackup}
          onClose={() => setModal({ kind: 'none' })}
          error={modalError}
        />
      )}

      {modal.kind === 'verifyResults' && (
        <VerifyResultsModal
          job={modal.job}
          targetName={modal.targetName}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
    </div>
  );
}
