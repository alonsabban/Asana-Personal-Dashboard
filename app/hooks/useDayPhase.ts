"use client";

import { useEffect, useState } from "react";

export type DayPhase = "lateNight" | "morning" | "noon" | "afternoon" | "evening" | "night";

const PHASE_BOUNDARIES: { maxHour: number; phase: DayPhase }[] = [
  { maxHour:  5, phase: "lateNight"  },
  { maxHour: 12, phase: "morning"    },
  { maxHour: 14, phase: "noon"       },
  { maxHour: 18, phase: "afternoon"  },
  { maxHour: 21, phase: "evening"    },
  { maxHour: 24, phase: "night"      },
];

export function getPhase(h: number): DayPhase {
  return (PHASE_BOUNDARIES.find((b) => h < b.maxHour) ?? PHASE_BOUNDARIES[PHASE_BOUNDARIES.length - 1]).phase;
}

export function useDayPhase(): DayPhase {
  const [phase, setPhase] = useState<DayPhase>("morning");

  useEffect(() => {
    const timerRef = { current: 0 as ReturnType<typeof setTimeout> };

    function schedule() {
      const now = new Date();
      const h = now.getHours();
      setPhase(getPhase(h));

      const nextBoundary = PHASE_BOUNDARIES.find((b) => h < b.maxHour && b.maxHour > h)?.maxHour ?? PHASE_BOUNDARIES[0].maxHour + 24;
      const next = new Date(now);
      next.setHours(nextBoundary < 24 ? nextBoundary : 0, 0, 0, 0);
      if (nextBoundary >= 24) next.setDate(next.getDate() + 1);

      timerRef.current = setTimeout(schedule, next.getTime() - now.getTime());
    }

    schedule();
    return () => clearTimeout(timerRef.current);
  }, []);

  return phase;
}
