export type DayHours = { closed: boolean; opensAt?: string; closesAt?: string };
export type WeeklyHours = Record<string, DayHours>;

export function isWithinOperatingHours(schedule: WeeklyHours | null | undefined, now = new Date()): boolean {
  if (!schedule) return true;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find(part => part.type === 'weekday')?.value.toLowerCase();
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const index = weekday ? days.indexOf(weekday) : -1;
  if (index < 0 || !Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  const nowMinutes = hour * 60 + minute;
  const today = schedule[days[index]];
  const previousDay = schedule[days[(index + 6) % 7]];
  const toMinutes = (value?: string) => value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  if (today && !today.closed) {
    const open = toMinutes(today.opensAt); const close = toMinutes(today.closesAt);
    if (open !== null && close !== null && open !== close && (close > open ? nowMinutes >= open && nowMinutes < close : nowMinutes >= open)) return true;
  }
  if (previousDay && !previousDay.closed) {
    const open = toMinutes(previousDay.opensAt); const close = toMinutes(previousDay.closesAt);
    if (open !== null && close !== null && close < open && nowMinutes < close) return true;
  }
  return false;
}
