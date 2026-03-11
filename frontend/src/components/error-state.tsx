import { Panel } from "@/components/panel";

export function ErrorState({ message }: { message: string }) {
  return (
    <Panel tone="critical" className="p-6 text-sm text-rose-200">
      <p className="font-medium">Data fetch failed</p>
      <p className="mt-2 text-rose-100/90">{message}</p>
    </Panel>
  );
}