const yenFormatter = new Intl.NumberFormat("ja-JP");

export function formatYen(value: number): string {
  return `¥${yenFormatter.format(value)}`;
}

export function formatDate(s: string): string {
  return s.replace(/-/g, "/");
}
