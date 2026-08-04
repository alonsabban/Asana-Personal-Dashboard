"use client";

import { useEffect, useState } from "react";

type Bookmark = { id: string; label: string; url: string };

const KEY = "pd.bookmarks";

const SEED: Bookmark[] = [
  { id: "seed-asana", label: "Asana", url: "https://app.asana.com" },
  { id: "seed-cal", label: "Google Calendar", url: "https://calendar.google.com" },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function BookmarksModule() {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? JSON.parse(raw) : SEED);
    } catch {
      setItems(SEED);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, ready]);

  function add() {
    const l = label.trim();
    let u = url.trim();
    if (!l || !u) return;
    if (!/^https?:\/\//.test(u)) u = "https://" + u;
    setItems((b) => [...b, { id: crypto.randomUUID(), label: l, url: u }]);
    setLabel("");
    setUrl("");
  }

  function remove(id: string) {
    setItems((b) => b.filter((x) => x.id !== id));
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Bookmarks</h2>
      </div>
      <div className="card-body">
        {items.length === 0 && <div className="empty">No links yet.</div>}
        {items.map((b) => (
          <div className="bm-item" key={b.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={b.url} target="_blank" rel="noreferrer">
                {b.label}
              </a>{" "}
              <span className="host">{hostOf(b.url)}</span>
            </div>
            <button className="icon-btn" onClick={() => remove(b.id)} title="Remove">
              ×
            </button>
          </div>
        ))}
        <div className="addrow">
          <input
            className="input"
            style={{ maxWidth: 120 }}
            placeholder="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="input"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn ghost" onClick={add}>
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
