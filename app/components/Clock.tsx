"use client";

import { useEffect, useState } from "react";

export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="clock" suppressHydrationWarning />;

  return (
    <div className="clock" suppressHydrationWarning>
      <span className="clock-time">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="clock-date">
        {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </span>
    </div>
  );
}
