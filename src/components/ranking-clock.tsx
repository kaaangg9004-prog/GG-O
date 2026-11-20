"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
// Static HTML and the first client render share the serialized server instant.
// Only after hydration does each ranking start its live clock.
const ClockContext = createContext(0);
export function RankingClockProvider({
  initialNow,
  children,
}: {
  initialNow: number;
  children: ReactNode;
}) {
  return (
    <ClockContext.Provider value={initialNow}>{children}</ClockContext.Provider>
  );
}
export function useRankingClock() {
  const initial = useContext(ClockContext),
    [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    tick();
    const timer = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}
