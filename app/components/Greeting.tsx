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

/**
 * Time-of-day greeting. `name` comes from the connected Asana account; until it
 * resolves we greet without one rather than guessing.
 */
export default function Greeting({ name }: { name?: string | null }) {
  const [slot, setSlot] = useState(TIME_SLOTS[1]);

  useEffect(() => {
    setSlot(getSlot(new Date().getHours()));
  }, []);

  return (
    <h1 suppressHydrationWarning style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
      {name ? `${slot.label}, ${name}` : slot.label}
      <span className="greeting-emoji" aria-hidden>{slot.emoji}</span>
    </h1>
  );
}
