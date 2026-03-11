import { Panel } from "@/components/panel";

export function EmptyState({ message }: { message: string }) {
  return <Panel tone="muted" className="p-6 text-sm text-slate-300">{message}</Panel>;
}