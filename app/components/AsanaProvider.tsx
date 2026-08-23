"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AsanaData } from "@/app/lib/asana";

type AsanaContextValue = {
  data: AsanaData | null;
  error: string | null;
  loading: boolean;
  /** True when no Asana token is configured — the app shows the setup gate. */
  needsSetup: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  query: string;
  setQuery: (q: string) => void;
};

const AsanaContext = createContext<AsanaContextValue | null>(null);

/** Hour (local time) of the single automatic daily refresh. */
const DAILY_REFRESH_HOUR = 8;

/** Milliseconds until the next DAILY_REFRESH_HOUR in the user's own timezone. */
function msUntilNextRefresh(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(DAILY_REFRESH_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function AsanaProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AsanaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Pull any pending voice tasks from the broker and create them in Asana
      // before fetching the task list, so they show up in this refresh.
      await fetch("/api/voice-poll", { cache: "no-store" }).catch(() => {});

      const res = await fetch("/api/asana/tasks", { cache: "no-store" });

      // 428 → no token configured. Not an error state; it's first-run setup.
      // Check status BEFORE parsing body — the response may be HTML on a
      // module-load error (e.g. AWS SDK issue), which would throw on res.json().
      if (res.status === 428) {
        setNeedsSetup(true);
        setData(null);
        return;
      }

      let json: Awaited<ReturnType<typeof res.json>>;
      try {
        json = await res.json();
      } catch {
        setError("Server error — restart the dashboard. If this is your first time, check dashboard-log.txt.");
        return;
      }

      if (!res.ok) throw new Error(json.error ?? "Failed to load Asana data");
      setNeedsSetup(false);
      setData(json as AsanaData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // One automatic refresh per day at 8 AM local time — no background polling and
  // no refresh-on-focus. Everything else is the manual Refresh button.
  // Re-arms after each run; skipped entirely until the user is connected.
  useEffect(() => {
    if (needsSetup) return;
    let timer: ReturnType<typeof setTimeout>;

    const arm = () => {
      timer = setTimeout(() => {
        refresh();
        arm();
      }, msUntilNextRefresh());
    };

    arm();
    return () => clearTimeout(timer);
  }, [refresh, needsSetup]);

  return (
    <AsanaContext.Provider
      value={{ data, error, loading, needsSetup, lastUpdated, refresh, query, setQuery }}
    >
      {children}
    </AsanaContext.Provider>
  );
}

export function useAsana(): AsanaContextValue {
  const ctx = useContext(AsanaContext);
  if (!ctx) throw new Error("useAsana must be used within AsanaProvider");
  return ctx;
}
