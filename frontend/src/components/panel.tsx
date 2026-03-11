import type { ReactNode } from "react";

type PanelTone = "default" | "muted" | "critical";

type PanelProps = {
  children: ReactNode;
  className?: string;
  tone?: PanelTone;
};

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const TONE_CLASSES: Record<PanelTone, string> = {
  default: "",
  muted: "ow-panel-muted",
  critical: "ow-panel-critical",
};

export function Panel({ children, className, tone = "default" }: PanelProps) {
  return <section className={joinClasses("ow-panel", TONE_CLASSES[tone], className)}>{children}</section>;
}