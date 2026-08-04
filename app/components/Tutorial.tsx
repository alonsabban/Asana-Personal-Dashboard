"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Step = {
  targetId?: string;
  title: string;
  body: string;
  anchor: "bottom" | "top" | "left" | "right" | "center";
  alignH?: "left" | "center" | "right";
};

const STEPS: Step[] = [
  {
    title: "Meet your dashboard 👋",
    body: "This dashboard connects to your Asana workspace and pulls every task assigned to you — across all its boards and projects — into one place. No more tab-switching. No more \"wait, where was that task again?\"",
    anchor: "center",
  },
  {
    targetId: "tutorial-topbar",
    title: "You're looking at it 🗺️",
    body: "This is mission control. Everything lives here — no alarms, no suits required. The ? Help button (that's this one) brings back this tour anytime.",
    anchor: "bottom",
    alignH: "left",
  },
  {
    targetId: "tutorial-search",
    title: "Search 🔍",
    body: "Type anything here to filter tasks across the whole page instantly. Go ahead, try your most cryptic task name — we dare you.",
    anchor: "bottom",
    alignH: "left",
  },
  {
    targetId: "tutorial-focus",
    title: "Today's Focus 🎯",
    body: "The tasks screaming loudest for attention — overdue ones first, naturally. Conquer them and feel like a hero.",
    anchor: "bottom",
    alignH: "left",
  },
  {
    targetId: "tutorial-subjects",
    title: "Tasks by Subject 📂",
    body: "Tasks auto-classified into subjects so you can see what's piling up where. Click the ⚙ gear to rename subjects or tweak the keywords used to categorize them. It's weirdly satisfying.",
    anchor: "top",
    alignH: "left",
  },
  {
    targetId: "tutorial-asana",
    title: "Full Task Table 📋",
    body: "Every open task in one place — sortable, filterable, and groupable by subject. Click the ▸ arrow on any row to expand it and see comments, subtasks, and full details. Edit due dates, assignees, status, and descriptions right in the table. No round-tripping to Asana required.",
    anchor: "top",
    alignH: "left",
  },
  {
    targetId: "tutorial-asana",
    title: "Status & Project Links 🔗",
    body: "Status pills are editable — click one to change it. Project names are clickable links straight to the Asana board. You're welcome.",
    anchor: "top",
    alignH: "left",
  },
];

function Balloon({
  step,
  index,
  total,
  onNext,
  onPrev,
  onClose,
}: {
  step: Step;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const balloonRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [tailPos, setTailPos] = useState<number>(32);

  useEffect(() => {
    if (step.anchor === "center") {
      function centerPos() {
        if (!balloonRef.current) return;
        const balloon = balloonRef.current.getBoundingClientRect();
        setPos({
          top: window.scrollY + (window.innerHeight - balloon.height) / 2,
          left: (window.innerWidth - balloon.width) / 2,
        });
      }
      centerPos();
      window.addEventListener("resize", centerPos);
      return () => window.removeEventListener("resize", centerPos);
    }

    const el = step.targetId ? document.getElementById(step.targetId) : null;
    if (!el || !balloonRef.current) return;

    function reposition() {
      const target = el!.getBoundingClientRect();
      const balloon = balloonRef.current!.getBoundingClientRect();
      const GAP = 14;
      const TAIL = 16;
      let top = 0;
      let left = 0;

      if (step.anchor === "bottom") {
        top = target.bottom + window.scrollY + GAP;
      } else {
        top = target.top + window.scrollY - balloon.height - GAP;
      }

      if (step.alignH === "left") {
        left = target.left + window.scrollX;
      } else if (step.alignH === "right") {
        left = target.right + window.scrollX - balloon.width;
      } else {
        left = target.left + window.scrollX + target.width / 2 - balloon.width / 2;
      }

      const maxLeft = window.innerWidth - balloon.width - 16;
      left = Math.max(16, Math.min(left, maxLeft));

      const targetCenterX = target.left + target.width / 2 + window.scrollX;
      const tail = Math.max(TAIL, Math.min(targetCenterX - left, balloon.width - TAIL));
      setTailPos(tail);
      setPos({ top, left });
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition);
    };
  }, [step]);

  // scroll target into view (not for centered steps)
  useEffect(() => {
    if (!step.targetId) return;
    const el = document.getElementById(step.targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [step]);

  const isLast = index === total - 1;

  return createPortal(
    <>
      {/* dim overlay */}
      <div className="tut-overlay" onClick={onClose} />

      {/* highlight ring around target (not for centered steps) */}
      {step.targetId && <HighlightRing targetId={step.targetId} />}

      {/* balloon */}
      <div
        ref={balloonRef}
        className={`tut-balloon${step.anchor !== "center" ? ` tut-tail-${step.anchor}` : ""}`}
        style={pos ? { top: pos.top, left: pos.left, "--tail-x": `${tailPos}px` } as React.CSSProperties : { visibility: "hidden" }}
      >
        <div className="tut-head">
          <span className="tut-title">{step.title}</span>
          <button className="tut-close" onClick={onClose} aria-label="Close tutorial">✕</button>
        </div>
        <p className="tut-body">{step.body}</p>
        <div className="tut-foot">
          <span className="tut-dots">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`tut-dot${i === index ? " active" : ""}`} />
            ))}
          </span>
          <div className="tut-nav">
            {index > 0 && (
              <button className="tut-btn secondary" onClick={onPrev}>← Back</button>
            )}
            {isLast ? (
              <button className="tut-btn primary" onClick={onClose}>Got it! 🙌</button>
            ) : (
              <button className="tut-btn primary" onClick={onNext}>Next →</button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function HighlightRing({ targetId }: { targetId: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function update() {
      const el = document.getElementById(targetId);
      if (el) setRect(el.getBoundingClientRect());
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [targetId]);

  if (!rect) return null;
  const PAD = 6;
  return createPortal(
    <div
      className="tut-highlight"
      style={{
        top: rect.top + window.scrollY - PAD,
        left: rect.left + window.scrollX - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }}
    />,
    document.body,
  );
}

export default function Tutorial() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  function start() { setStep(0); setActive(true); }
  function close() { setActive(false); }
  function next() { setStep((s) => Math.min(s + 1, STEPS.length - 1)); }
  function prev() { setStep((s) => Math.max(s - 1, 0)); }

  return (
    <>
      <button className="topbar-text-btn" onClick={start}>
        Tutorial
      </button>
      {active && (
        <Balloon
          step={STEPS[step]}
          index={step}
          total={STEPS.length}
          onNext={next}
          onPrev={prev}
          onClose={close}
        />
      )}
    </>
  );
}
