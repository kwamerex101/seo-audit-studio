/**
 * Format an ISO timestamp for display.
 * Returns a relative phrase ("2 hours ago") for anything within 24h, else a
 * tight absolute string ("Apr 24 · 5:56 PM").
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ms = Date.now() - d.getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return formatAbsolute(d);
}

export function formatAbsolute(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  const same = date.getFullYear() === new Date().getFullYear();
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: same ? undefined : "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}
