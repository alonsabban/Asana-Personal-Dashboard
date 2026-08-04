"use client";

import { useEffect, useState } from "react";

/**
 * Time-of-day greeting. `name` comes from the connected Asana account; until it
 * resolves we greet without one rather than guessing.
 */
export default function Greeting({ name }: { name?: string | null }) {
  const [part, setPart] = useState("Hello");

  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <h1 suppressHydrationWarning>
      {name ? `${part}, ${name}` : part}
    </h1>
  );
}
