"use client";

import { useEffect, useState } from "react";

const TIME_SLOTS = [
  { maxHour:  5, label: "Good night",      emoji: "🌙" },
  { maxHour: 12, label: "Good morning",    emoji: "🌅" },
  { maxHour: 14, label: "Good noon",       emoji: "☀️" },
  { maxHour: 18, label: "Good afternoon",  emoji: "🌇" },
  { maxHour: 21, label: "Good evening",    emoji: "🌆" },
  { maxHour: 24, label: "Good night",      emoji: "🌙" },
];

function getSlot(h: number) {
  return TIME_SLOTS.find((s) => h < s.maxHour) ?? TIME_SLOTS[TIME_SLOTS.length - 1];
}

export default function Greeting({ name }: { name?: string | null }) {
  const [slot, setSlot] = useState(TIME_SLOTS[1]);

  useEffect(() => {
    const timerRef = { current: 0 as ReturnType<typeof setTimeout> };

    function schedule() {
      const now = new Date();
      const h = now.getHours();
      setSlot(getSlot(h));

      // fire again at the next slot boundary
      const next = new Date(now);
      const nextBoundary = TIME_SLOTS.find((s) => h < s.maxHour && s.maxHour > h)?.maxHour
        ?? TIME_SLOTS[0].maxHour + 24;
      next.setHours(nextBoundary < 24 ? nextBoundary : 0, 0, 0, 0);
      if (nextBoundary >= 24) next.setDate(next.getDate() + 1);

      timerRef.current = setTimeout(schedule, next.getTime() - now.getTime());
    }

    schedule();
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <h1 suppressHydrationWarning style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
      {name ? `${slot.label}, ${name}` : slot.label}
      <span className="greeting-emoji" aria-hidden>{slot.emoji}</span>
    </h1>
  );
}
