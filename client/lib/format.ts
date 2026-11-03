// 时间格式化。后端返回的是 naive UTC(不带 Z),这里统一补上再按本地时区显示。
// 带文字的格式(今天/昨天/几月几日/周几)随界面语言;组件里把 useT() 的字典传进来,
// 这样语言一变列表会重算;不传就取当前字典。

import { getDict, type Dict } from './i18n';

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

/** 列表分组标题:今天 / 昨天 / 11月2日 周日 / 2025年11月2日。 */
export function dayLabel(key: string, t: Dict = getDict()): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((startOfToday.getTime() - date.getTime()) / 86400000);
  const weekday = t.dates.weekdays[date.getDay()];
  if (diffDays === 0) return `${t.dates.today} · ${weekday}`;
  if (diffDays === 1) return `${t.dates.yesterday} · ${weekday}`;
  if (y === today.getFullYear()) return `${t.dates.monthDay(m, d)} · ${weekday}`;
  return `${t.dates.yearMonthDay(y, m, d)} · ${weekday}`;
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

export function formatRemaining(ms: number, t: Dict = getDict()): string {
  const hours = ms / 3600000;
  if (hours >= 1) return t.dates.hours(Math.floor(hours));
  return t.dates.minutes(Math.max(1, Math.floor(ms / 60000)));
}

export function formatLongDate(d: Date, t: Dict = getDict()): string {
  return t.dates.longDate(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    t.dates.weekdays[d.getDay()],
    `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  );
}
