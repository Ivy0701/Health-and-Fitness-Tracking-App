function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * @param {string | number | Date} input
 * @returns {string}
 */
export function formatRelativeTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  const now = Date.now();
  const diff = now - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return `Yesterday ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
