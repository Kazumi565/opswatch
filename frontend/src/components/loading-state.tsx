import { Panel } from "@/components/panel";

export function LoadingState({ message = "Loading data..." }: { message?: string }) {
  return (
    <Panel tone="muted" className="p-6 text-sm text-slate-300">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-accent/80 animate-pulse" aria-hidden />
        <span>{message}</span>
      </div>
    </Panel>
  );
}