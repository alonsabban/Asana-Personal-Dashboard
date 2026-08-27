"use client";

import { useEffect, useState } from "react";
import { useDayPhase } from "@/app/hooks/useDayPhase";

const QUIPS: Record<string, string[]> = {
  lateNight: [
    "Your pillow filed a missing person report.",
    "Even the bugs have gone to sleep. Have you considered their wisdom?",
    "The cleaning crew has come and gone. Twice.",
    "Fun fact: sleep deprivation is free and comes with productivity loss at no extra charge.",
    "Your out-of-office reply would like a word with you.",
    "Pro tip: dreams also count as strategic planning.",
    "The coffee machine just texted asking for a break.",
    "Legend has it some people use this hour for sleeping.",
    "If you squint hard enough, the screen kind of looks like a sunrise.",
    "Your houseplants called. They miss you.",
  ],
  morning: [
    "Coffee first. World domination second.",
    "Shake off the cobwebs. The inbox won't clear itself.",
    "The cows won't milk themselves. Neither will your tasks.",
    "Today's agenda: convincingly pretend to be a morning person.",
    "The early bird gets the worm. The second mouse gets the cheese. No pressure.",
    "Your calendar is already judging your choices.",
    "The day is young. Your to-do list is younger and hungrier.",
    "Good news: you beat half the office in. Bad news: they're all WFH.",
    "First meeting in 45 minutes. Enough time to panic properly.",
    "Rise and grind — or at least rise and sip.",
  ],
  noon: [
    "Your stomach's Slack status: 🔴 Urgent.",
    "Lunch break: the only meeting everyone actually shows up to on time.",
    "The afternoon slump is on its way. Enjoy the last minutes of optimism.",
    "Whatever you haven't done yet is now officially afternoon's problem.",
    "Post-lunch Zoom call: nature's sleeping pill, gift-wrapped.",
    "Half the day gone, half the glory still ahead. Or half the dread. Tomato, tomahto.",
    "Energy at peak. Exploit this window aggressively before it closes.",
    "The fridge in the break room is not going to raid itself.",
    "Pro tip: eating at your desk still counts as a lunch break if you feel bad about it.",
    "You've survived the morning. The morning survived you. Call it a draw.",
  ],
  afternoon: [
    "The 3pm slump: brought to you by optimism, betrayed by biology.",
    "One more coffee and you'll either finish that report or vibrate into another dimension.",
    "The meeting that could have been an email has entered the chat.",
    "If your head hits the keyboard, at least it'll generate a response.",
    "Four o'clock: the hour when 'quick question' means anything but.",
    "The good news: almost done. The bad news: 'almost' is doing heavy lifting.",
    "The day is winding down. Your task list is winding up. Charming.",
    "You are roughly 75% through the workday. The finish line is visible. Push.",
    "If productivity were weather, it'd be cloudy with a chance of scrolling.",
    "Deliverables still rising. Sun already setting. Classic.",
  ],
  evening: [
    "The office lights went into eco mode. You didn't.",
    "Your dinner is somewhere between 'warm' and 'archaeological artifact' by now.",
    "Work-life balance tip: 'life' is the part that's happening without you right now.",
    "Technically still business hours somewhere in the world.",
    "Your family has started assigning your seat to someone else at dinner.",
    "The cleaning crew gave you a knowing nod. You are one of them now.",
    "Fun fact: most animals sleep when it gets dark. Just something to consider.",
    "Somewhere, someone is watching a sunset. You are watching a Jira board.",
    "At this point you're not working late — you're arriving early for tomorrow.",
    "If dedication were a currency, you'd be rich. Unfortunately.",
  ],
  night: [
    "Your spouse's therapist just added 'work habits' to the agenda.",
    "Reminder: 'I'll wrap up in five minutes' has a historical accuracy of 0%.",
    "Your bed filed a complaint with HR. HR agreed with the bed.",
    "Don't text and drive. Also, please stop Slacking and sleep-depriving.",
    "The Netflix algorithm has given up recommending things and gone to bed.",
    "Tomorrow-you is going to have strong feelings about Tonight-you's choices.",
    "Even your laptop fan sounds tired.",
    "At this hour, every problem looks both urgent and completely unsolvable.",
    "Studies show people who stop working at night live longer. Just saying.",
    "Your houseplants are fine, probably. You wouldn't know.",
  ],
};

export default function DailyQuip() {
  const phase = useDayPhase();
  const [quip, setQuip] = useState("");

  useEffect(() => {
    const bucket = QUIPS[phase];
    setQuip(bucket[Math.floor(Math.random() * bucket.length)]);
  }, [phase]);

  if (!quip) return null;

  return (
    <div className="daily-quip-banner" suppressHydrationWarning>
      <span>{quip}</span>
    </div>
  );
}
