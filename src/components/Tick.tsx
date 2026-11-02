import { useRef } from "react";

/** A live number that glows green or red for a moment whenever it moves (the element remounts to replay the glow). */
export function Tick({ value, children, className = "" }: { value: number | undefined; children: React.ReactNode; className?: string }) {
  const prev = useRef<number | undefined>(undefined);
  const dir = useRef<"" | "t-up" | "t-dn">("");
  if (value != null && prev.current != null && value !== prev.current) dir.current = value > prev.current ? "t-up" : "t-dn";
  prev.current = value;
  return <span key={value} className={`tick ${dir.current} ${className}`}>{children}</span>;
}
