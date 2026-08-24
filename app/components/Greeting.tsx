"use client";

import { useEffect, useState } from "react";

export default function Greeting({ name }: { name?: string | null }) {
  const [part, setPart] = useState("Hello");

  useEffect(() => {
    const timerRef = { current: 0 as ReturnType<typeof setTimeout> };

    function schedule() {
      const now = new Date();
      const h = now.getHours();
      setPart(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

      // fire again exactly at the next phase boundary (midnight, noon, 6 pm)
      const next = new Date(now);
      if (h < 12)      next.setHours(12, 0, 0, 0);
      else if (h < 18) next.setHours(18, 0, 0, 0);
      else             { next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0); }

      timerRef.current = setTimeout(schedule, next.getTime() - now.getTime());
    }

    schedule();
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <h1 suppressHydrationWarning>
      {name ? `${part}, ${name}` : part}
    </h1>
  );
}
