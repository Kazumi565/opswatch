export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }
  return value.toLocaleString("en-US");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDurationMs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}
