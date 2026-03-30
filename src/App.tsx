import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
  type CSSProperties,
} from "react";
import "./App.css";
import { useWakeLock } from "./hooks/useWakeLock";

const MINUTE_IN_MS = 60_000;
const CELEBRATION_DURATION_MS = 5_000;
const STORAGE_KEY = "pomodoro-timer/session-v1";
const DEFAULT_FOCUS_MINUTES = import.meta.env.DEV ? 1 : 50;
const DEFAULT_BREAK_MINUTES = 15;
const FOCUS_OPTIONS = [15, 20, 25, 30, 40, 50, 60, 75, 90];

const BREAK_OPTIONS = [5, 10, 15, 20, 25, 30];
const SETTINGS_MODAL_TITLE_ID = "settings-modal-title";

type TimerMode = "focus" | "break";
type TimerStatus = "idle" | "running" | "paused" | "celebrating";

type SessionState = {
  focusMinutes: number;
  breakMinutes: number;
  mode: TimerMode;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  targetEpochMs: number | null;
  completedFocuses: number;
};

type PersistedSession = {
  version: number;
  focusMinutes: number;
  breakMinutes: number;
  mode: TimerMode;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number | null;
  targetEpochMs: number | null;
  completedFocuses: number;
};

type CelebrationState = {
  breakMinutes: number;
  completedFocuses: number;
  message: string;
};

const isTimerMode = (value: unknown): value is TimerMode =>
  value === "focus" || value === "break";

const isTimerStatus = (value: unknown): value is TimerStatus =>
  value === "idle" ||
  value === "running" ||
  value === "paused" ||
  value === "celebrating";

const getDurationMs = (
  mode: TimerMode,
  focusMinutes: number,
  breakMinutes: number,
) => (mode === "focus" ? focusMinutes : breakMinutes) * MINUTE_IN_MS;

const buildCelebrationMessage = (breakMinutes: number) =>
  `お疲れ様でした。\n${breakMinutes}分、休憩しましょう`;

const createRunningSession = (
  mode: TimerMode,
  focusMinutes: number,
  breakMinutes: number,
  completedFocuses: number,
): SessionState => {
  const durationMs = getDurationMs(mode, focusMinutes, breakMinutes);

  return {
    focusMinutes,
    breakMinutes,
    mode,
    status: "running",
    durationMs,
    remainingMs: durationMs,
    targetEpochMs: Date.now() + durationMs,
    completedFocuses,
  };
};

const createSession = (
  mode: TimerMode,
  status: TimerStatus,
  focusMinutes: number,
  breakMinutes: number,
  completedFocuses: number,
  remainingMs?: number,
): SessionState => {
  const durationMs = getDurationMs(mode, focusMinutes, breakMinutes);

  return {
    focusMinutes,
    breakMinutes,
    mode,
    status,
    durationMs,
    remainingMs:
      typeof remainingMs === "number"
        ? Math.max(0, remainingMs)
        : status === "celebrating"
          ? 0
          : durationMs,
    targetEpochMs: null,
    completedFocuses,
  };
};

const createDefaultSession = () =>
  createSession(
    "focus",
    "idle",
    DEFAULT_FOCUS_MINUTES,
    DEFAULT_BREAK_MINUTES,
    0,
  );

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const hydrateSession = (): SessionState => {
  if (typeof window === "undefined") {
    return createDefaultSession();
  }

  const fallback = createDefaultSession();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSession>;

    if (parsed.version !== 1) {
      return fallback;
    }

    const focusMinutes = isPositiveNumber(parsed.focusMinutes)
      ? parsed.focusMinutes
      : fallback.focusMinutes;
    const breakMinutes = isPositiveNumber(parsed.breakMinutes)
      ? parsed.breakMinutes
      : fallback.breakMinutes;
    const completedFocuses = 0;
    const mode = isTimerMode(parsed.mode) ? parsed.mode : "focus";
    const status = isTimerStatus(parsed.status) ? parsed.status : "idle";
    const durationMs = isPositiveNumber(parsed.durationMs)
      ? parsed.durationMs
      : getDurationMs(mode, focusMinutes, breakMinutes);
    const remainingMs = isNonNegativeNumber(parsed.remainingMs)
      ? parsed.remainingMs
      : durationMs;
    const targetEpochMs = isPositiveNumber(parsed.targetEpochMs)
      ? parsed.targetEpochMs
      : null;

    if (status === "running" && targetEpochMs !== null) {
      const nextRemainingMs = Math.max(0, targetEpochMs - Date.now());

      if (nextRemainingMs === 0) {
        if (mode === "focus") {
          return createRunningSession(
            "break",
            focusMinutes,
            breakMinutes,
            completedFocuses + 1,
          );
        }

        return createRunningSession(
          "focus",
          focusMinutes,
          breakMinutes,
          completedFocuses,
        );
      }

      return {
        focusMinutes,
        breakMinutes,
        mode,
        status: "running",
        durationMs,
        remainingMs: nextRemainingMs,
        targetEpochMs,
        completedFocuses,
      };
    }

    if (status === "paused") {
      return {
        focusMinutes,
        breakMinutes,
        mode,
        status: "paused",
        durationMs,
        remainingMs,
        targetEpochMs: null,
        completedFocuses,
      };
    }

    if (status === "celebrating") {
      const breakDurationMs = getDurationMs(
        "break",
        focusMinutes,
        breakMinutes,
      );

      return {
        focusMinutes,
        breakMinutes,
        mode: "break",
        status: "running",
        durationMs: breakDurationMs,
        remainingMs: breakDurationMs,
        targetEpochMs: Date.now() + breakDurationMs,
        completedFocuses,
      };
    }

    return {
      focusMinutes,
      breakMinutes,
      mode,
      status: "idle",
      durationMs,
      remainingMs,
      targetEpochMs: null,
      completedFocuses,
    };
  } catch {
    return fallback;
  }
};

const formatClock = (remainingMs: number) => {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

function App() {
  const [session, setSession] = useState<SessionState>(() => hydrateSession());
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const isRunning = session.status === "running";
  const isPaused = session.status === "paused";
  const isCelebrating = celebration !== null;
  const isSessionActive = isRunning || isPaused;
  const canEditDurations = !isSessionActive;
  const progress = Math.min(
    1,
    Math.max(0, 1 - session.remainingMs / session.durationMs),
  );
  const ringStyle = {
    "--progress": `${progress * 360}deg`,
    "--timer-accent":
      session.mode === "focus" ? "var(--focus-accent)" : "var(--break-accent)",
  } as CSSProperties;
  const wakeLock = useWakeLock(isRunning);

  const completeCurrentSession = useEffectEvent(() => {
    setIsSettingsOpen(false);
    if (session.mode === "focus") {
      const nextCompletedFocuses = session.completedFocuses + 1;

      setCelebration({
        breakMinutes: session.breakMinutes,
        completedFocuses: nextCompletedFocuses,
        message: buildCelebrationMessage(session.breakMinutes),
      });

      startTransition(() => {
        setSession(
          createRunningSession(
            "break",
            session.focusMinutes,
            session.breakMinutes,
            nextCompletedFocuses,
          ),
        );
      });

      return;
    }

    setCelebration(null);
    startTransition(() => {
      setSession(
        createRunningSession(
          "focus",
          session.focusMinutes,
          session.breakMinutes,
          session.completedFocuses,
        ),
      );
    });
  });

  useEffect(() => {
    if (session.status !== "running" || session.targetEpochMs === null) {
      return;
    }

    const tick = () => {
      const nextRemainingMs = Math.max(0, session.targetEpochMs! - Date.now());

      if (nextRemainingMs === 0) {
        completeCurrentSession();
        return;
      }

      setSession((current) => {
        if (
          current.status !== "running" ||
          current.targetEpochMs !== session.targetEpochMs
        ) {
          return current;
        }

        return {
          ...current,
          remainingMs: nextRemainingMs,
        };
      });
    };

    tick();
    const intervalId = window.setInterval(tick, 250);

    return () => window.clearInterval(intervalId);
  }, [session.status, session.targetEpochMs]);

  useEffect(() => {
    const currentLabel =
      session.status === "celebrating"
        ? "集中完了"
        : session.mode === "focus"
          ? "集中中"
          : "休憩中";

    document.title =
      session.status === "idle"
        ? "Pomodoro Timer"
        : `${formatClock(session.remainingMs)} | ${currentLabel}`;

    return () => {
      document.title = "Pomodoro Timer";
    };
  }, [session.mode, session.remainingMs, session.status]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const snapshot: PersistedSession = {
      version: 1,
      focusMinutes: session.focusMinutes,
      breakMinutes: session.breakMinutes,
      mode: session.mode,
      status: session.status,
      durationMs: session.durationMs,
      remainingMs: session.status === "running" ? null : session.remainingMs,
      targetEpochMs: session.targetEpochMs,
      completedFocuses: 0,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    session.breakMinutes,
    session.completedFocuses,
    session.durationMs,
    session.focusMinutes,
    session.mode,
    session.remainingMs,
    session.status,
    session.targetEpochMs,
  ]);

  useEffect(() => {
    if (!isSessionActive) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSessionActive]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (celebration === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCelebration(null);
    }, CELEBRATION_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [celebration]);

  const closeSettings = () => setIsSettingsOpen(false);
  const openSettings = () => setIsSettingsOpen(true);

  const runTimer = (mode: TimerMode) => {
    closeSettings();
    setCelebration(null);
    startTransition(() => {
      setSession((current) => {
        const durationMs = getDurationMs(
          mode,
          current.focusMinutes,
          current.breakMinutes,
        );

        return {
          ...current,
          mode,
          status: "running",
          durationMs,
          remainingMs: durationMs,
          targetEpochMs: Date.now() + durationMs,
        };
      });
    });
  };

  const pauseTimer = () => {
    setSession((current) => {
      if (current.status !== "running" || current.targetEpochMs === null) {
        return current;
      }

      return {
        ...current,
        status: "paused",
        remainingMs: Math.max(0, current.targetEpochMs - Date.now()),
        targetEpochMs: null,
      };
    });
  };

  const resumeTimer = () => {
    setSession((current) => {
      if (current.status !== "paused") {
        return current;
      }

      return {
        ...current,
        status: "running",
        targetEpochMs: Date.now() + current.remainingMs,
      };
    });
  };

  const resetTimer = () => {
    setCelebration(null);
    startTransition(() => {
      setSession((current) =>
        createSession(
          "focus",
          "idle",
          current.focusMinutes,
          current.breakMinutes,
          current.completedFocuses,
        ),
      );
    });
  };

  const startFocus = () => runTimer("focus");

  const updateFocusMinutes = (nextFocusMinutes: number) => {
    setSession((current) => {
      const nextSession = {
        ...current,
        focusMinutes: nextFocusMinutes,
      };

      if (current.mode === "focus" && !isSessionActive) {
        const durationMs = getDurationMs(
          "focus",
          nextFocusMinutes,
          current.breakMinutes,
        );

        return {
          ...nextSession,
          durationMs,
          remainingMs: durationMs,
        };
      }

      return nextSession;
    });
  };

  const updateBreakMinutes = (nextBreakMinutes: number) => {
    setSession((current) => {
      const nextSession = {
        ...current,
        breakMinutes: nextBreakMinutes,
      };

      if (current.mode === "break" && !isSessionActive) {
        const durationMs = getDurationMs(
          "break",
          current.focusMinutes,
          nextBreakMinutes,
        );

        return {
          ...nextSession,
          durationMs,
          remainingMs: durationMs,
        };
      }

      return nextSession;
    });
  };

  const timerLabel = session.mode === "focus" ? "集中タイム" : "休憩タイム";

  const timerDescription =
    session.status === "paused"
      ? "途中で止めています。再開するとすぐ戻れます。"
      : session.mode === "focus"
        ? "いまは目の前の一つに集中する時間です。"
        : "肩の力を抜いて、次の集中に備えましょう。";

  const wakeLockLabel = wakeLock.active ? "画面保持: ON" : "画面保持: OFF";

  return (
    <main className={`app ${isCelebrating ? "is-celebrating" : ""}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Pomodoro Timer</p>
        </div>
        <div className="topbar-actions">
          <div className="status-cluster" role="status" aria-live="polite">
            <span
              className={`status-pill ${wakeLock.active ? "active" : "inactive"}`}
            >
              {wakeLockLabel}
            </span>
            <span className="status-pill subtle">
              完了した集中 {session.completedFocuses} 回
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-haspopup="dialog"
            aria-expanded={isSettingsOpen}
            aria-controls="settings-modal"
            onClick={openSettings}
          >
            <svg
              className="button-icon gear-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              fill="none"
            >
              <path
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>設定</span>
          </button>
        </div>
      </header>

      <section className="layout">
        <section className="panel timer-panel">
          <div className="timer-toolbar">
            <div className="preset-summary">
              <p className="panel-title">現在の設定</p>
              <div className="preset-strip" aria-label="現在のプリセット">
                <span>{session.focusMinutes} 分 集中</span>
                <span>{session.breakMinutes} 分 休憩</span>
              </div>
            </div>
          </div>

          <div className="mode-row">
            <p className="mode-copy">{timerDescription}</p>
          </div>

          <div className="timer-ring" style={ringStyle}>
            <div className="timer-core">
              <p className={`timer-caption ${session.mode}`}>{timerLabel}</p>
              <p className="timer-value" aria-live="polite">
                {formatClock(session.remainingMs)}
              </p>
              <p className="timer-subcopy">
                {session.status === "idle"
                  ? "準備完了"
                  : session.status === "paused"
                    ? "一時停止中"
                    : "進行中"}
              </p>
            </div>
          </div>

          <div className="actions">
            {!isRunning && !isPaused && (
              <button className="primary-button" onClick={startFocus}>
                {session.focusMinutes} 分の集中を始める
              </button>
            )}

            {isRunning && (
              <button className="primary-button" onClick={pauseTimer}>
                一時停止
              </button>
            )}

            {isPaused && (
              <button className="primary-button" onClick={resumeTimer}>
                再開する
              </button>
            )}

            <button className="secondary-button" onClick={resetTimer}>
              最初からやり直す
            </button>
          </div>

          <dl className="stats-grid">
            <div>
              <dt>次の休憩</dt>
              <dd>{session.breakMinutes} 分</dd>
            </div>
            <div>
              <dt>集中完了数</dt>
              <dd>{session.completedFocuses} 回</dd>
            </div>
          </dl>
        </section>
      </section>

      {isSettingsOpen && (
        <section className="settings-modal-backdrop" onClick={closeSettings}>
          <div
            id="settings-modal"
            className="settings-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={SETTINGS_MODAL_TITLE_ID}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div className="panel-heading">
                <p id={SETTINGS_MODAL_TITLE_ID} className="panel-title">
                  時間設定
                </p>
                <p className="panel-copy">
                  変更はすぐに反映されます。タイマーの実行中は設定変更をロックします。
                </p>
              </div>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>集中時間</span>
                <select
                  value={session.focusMinutes}
                  disabled={!canEditDurations}
                  autoFocus={canEditDurations}
                  onChange={(event) =>
                    updateFocusMinutes(Number(event.currentTarget.value))
                  }
                >
                  {FOCUS_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} 分
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>休憩時間</span>
                <select
                  value={session.breakMinutes}
                  disabled={!canEditDurations}
                  onChange={(event) =>
                    updateBreakMinutes(Number(event.currentTarget.value))
                  }
                >
                  {BREAK_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} 分
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="preset-strip" aria-label="設定中のプリセット">
              <span>{session.focusMinutes} 分 集中</span>
              <span>{session.breakMinutes} 分 休憩</span>
            </div>

            <div className="note-card modal-note">
              <p className="note-title">ヒント</p>
              <p className="note-copy">
                集中や休憩の途中は数字が固定されます。止めるかリセットすると再び変更できます。
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeSettings}
              >
                閉じる
              </button>
            </div>
          </div>
        </section>
      )}

      {celebration !== null && (
        <section className="celebration-overlay" aria-live="assertive">
          <div className="celebration-shell">
            <p className="celebration-message">{celebration.message}</p>
            <p className="celebration-subcopy">
              休憩はすでに始まっています。この表示は 5 秒後に自動で閉じます。
            </p>

            <div className="celebration-metrics">
              <span>今日の完了: {celebration.completedFocuses} 回</span>
              <span>次の休憩: {celebration.breakMinutes} 分</span>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
