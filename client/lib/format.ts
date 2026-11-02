// 时间格式化。后端返回的是 naive UTC(不带 Z),这里统一补上再按本地时区显示。

export function parseUtc(iso: string): Date {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(iso: string): string {
  const d = parseUtc(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(iso: string): string {
  const d = parseUtc(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatTime(iso)}`;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 列表分组标题:今天 / 昨天 / 11月2日 周日 / 2025年11月2日。 */
export function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((startOfToday.getTime() - date.getTime()) / 86400000);
  const weekday = WEEKDAYS[date.getDay()];
  if (diffDays === 0) return `今天 · ${weekday}`;
  if (diffDays === 1) return `昨天 · ${weekday}`;
  if (y === today.getFullYear()) return `${m}月${d}日 · ${weekday}`;
  return `${y}年${m}月${d}日 · ${weekday}`;
}

/** 会话列表里的时间:今天显示时刻,否则显示月-日。 */
export function formatRecent(iso: string): string {
  const d = parseUtc(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? formatTime(iso) : `${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatRemaining(ms: number): string {
  const hours = ms / 3600000;
  if (hours >= 1) return `${Math.floor(hours)} 小时`;
  return `${Math.max(1, Math.floor(ms / 60000))} 分钟`;
}

export function formatLongDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]} · ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
