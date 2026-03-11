export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-6 text-sm text-rose-200">
      <p className="font-medium">Data fetch failed</p>
      <p className="mt-2 text-rose-100/90">{message}</p>
    </div>
  );
}
