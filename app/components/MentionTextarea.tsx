"use client";

import { useRef, useState } from "react";

type UserHit = { gid: string; name: string; email: string | null };
export type MentionEntry = { gid: string; name: string };

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildHtmlWithMentions(text: string, mentions: MentionEntry[]): string | null {
  if (mentions.length === 0) return null;
  const escaped = escapeHtml(text);
  const sorted = [...mentions].sort((a, b) => b.name.length - a.name.length);
  let result = escaped;
  for (const m of sorted) {
    result = result.replaceAll(
      `@${m.name}`,
      `<a data-asana-type="user" data-asana-gid="${m.gid}">@${m.name}</a>`,
    );
  }
  return `<body>${result}</body>`;
}

interface ControlledProps {
  value: string;
  onChange: (text: string) => void;
  defaultValue?: never;
  onSubmit?: (text: string, htmlText: string | null) => void;
  onBlur?: (text: string, htmlText: string | null) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface UncontrolledProps {
  defaultValue: string;
  value?: never;
  onChange?: never;
  onSubmit?: (text: string, htmlText: string | null) => void;
  onBlur?: (text: string, htmlText: string | null) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

type Props = ControlledProps | UncontrolledProps;

export default function MentionTextarea(props: Props) {
  const { onSubmit, onBlur, placeholder, rows = 3, autoFocus, className, style } = props;

  // Uncontrolled mode: manage text locally, only push on blur/submit.
  const [localValue, setLocalValue] = useState<string>(() =>
    "defaultValue" in props ? (props.defaultValue ?? "") : "",
  );

  const isUncontrolled = "defaultValue" in props;
  const text = isUncontrolled ? localValue : (props.value as string);
  function setText(v: string) {
    if (isUncontrolled) setLocalValue(v);
    else (props as ControlledProps).onChange(v);
  }

  const [hits, setHits] = useState<UserHit[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentions, setMentions] = useState<MentionEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Keep a ref to the latest text so blur's setTimeout reads the current value.
  const textRef = useRef(text);
  textRef.current = text;
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;

  function getHtml() {
    return buildHtmlWithMentions(textRef.current, mentionsRef.current);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    const cursor = e.target.selectionStart ?? newVal.length;
    const textBeforeCursor = newVal.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      const query = atMatch[1];
      setMentionStart(cursor - atMatch[0].length);
      setMentionQuery(query);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          const r = await fetch(`/api/asana/users?q=${encodeURIComponent(query)}`, { cache: "no-store" });
          const j = await r.json();
          setHits(j.users ?? []);
        } catch { setHits([]); }
      }, 200);
    } else {
      setMentionStart(null);
      setMentionQuery("");
      setHits([]);
    }

    setText(newVal);
  }

  function pickUser(user: UserHit) {
    if (mentionStart === null) return;
    const before = textRef.current.slice(0, mentionStart);
    const after = textRef.current.slice(mentionStart + 1 + mentionQuery.length);
    const newVal = `${before}@${user.name}${after}`;
    const newMentions = [...mentionsRef.current.filter((m) => m.gid !== user.gid), { gid: user.gid, name: user.name }];
    setMentions(newMentions);
    mentionsRef.current = newMentions;
    setHits([]);
    setMentionStart(null);
    setMentionQuery("");
    setText(newVal);
    setTimeout(() => {
      if (taRef.current) {
        const pos = before.length + user.name.length + 1;
        taRef.current.focus();
        taRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setHits([]); setMentionStart(null); }
    if (e.key === "Enter" && e.ctrlKey && onSubmit) { e.preventDefault(); onSubmit(textRef.current, getHtml()); }
  }

  function handleBlur() {
    // Delay so pickUser's onMouseDown fires first.
    setTimeout(() => {
      if (document.activeElement !== taRef.current) {
        onBlur?.(textRef.current, getHtml());
      }
    }, 210);
  }

  return (
    <div className="mention-wrap">
      <textarea
        ref={taRef}
        className={className}
        style={style}
        value={text}
        rows={rows}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {hits.length > 0 && (
        <div className="hits mention-hits">
          {hits.map((u) => (
            <button key={u.gid} className="hit" onMouseDown={(e) => { e.preventDefault(); pickUser(u); }}>
              <span>{u.name}</span>
              {u.email && <span className="host">{u.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
