import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** The picture being enlarged, and when the wait began. */
export interface Waiting {
  path: string;
  since: number;
}

// An enlargement takes from seconds to minutes, so the ring fills fast at first and then
// ever slower, never quite full: half after this many seconds.
const HALF_TIME = 20;

/** How full the ring is after `seconds` of waiting, from 0 towards 1. */
export function waitedFraction(seconds: number): number {
  return 1 - Math.pow(0.5, Math.max(0, seconds) / HALF_TIME);
}

interface WaitingRingProps {
  since: number;
  /** Small on gallery tiles, where there is no room for words. */
  compact?: boolean;
}

/**
 * Laid over the old picture while its enlarged copy is on its way, so it is clear the
 * picture shown is still the old one.
 */
export function WaitingRing({ since, compact = false }: WaitingRingProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const fraction = waitedFraction((now - since) / 1000);
  const size = compact ? 36 : 64;
  const stroke = compact ? 4 : 5;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <div
      role="status"
      aria-label="Gamla versionen. Väntar på den förstorade bilden."
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40 text-white"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 drop-shadow" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className={cn("rounded-full bg-black/50 px-3 py-1 text-sm drop-shadow", compact && "sr-only")}>
        Gamla versionen, väntar på den förstorade
      </span>
    </div>
  );
}
