"use client";

import { useDayPhase } from "@/app/hooks/useDayPhase";

const PHASE_LABELS: Record<ReturnType<typeof useDayPhase>, string> = {
  lateNight:  "Good night",
  morning:    "Good morning",
  noon:       "Good noon",
  afternoon:  "Good afternoon",
  evening:    "Good evening",
  night:      "Good night",
};

export default function Greeting({ name }: { name?: string | null }) {
  const phase = useDayPhase();
  const label = PHASE_LABELS[phase];

  return (
    <h1 suppressHydrationWarning>
      {name ? `${label}, ${name}` : label}
    </h1>
  );
}
