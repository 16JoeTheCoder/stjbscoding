// Dates and times, always in Asia/Jakarta (UTC+7, no daylight saving).
// Dates are plain "YYYY-MM-DD" strings so they sort and compare as text.
import { TIME_ZONE } from "./config.js";

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Firestore timestamps, numbers and Dates all become milliseconds.
export const toMillis = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0);

export const dateOf = (t = Date.now()) => dateFmt.format(new Date(toMillis(t)));
export const timeOf = (t = Date.now()) => timeFmt.format(new Date(toMillis(t)));
export const today = () => dateOf(Date.now());

export function minutesNow(t = Date.now()) {
  const [h, m] = timeOf(t).split(":").map(Number);
  return h * 60 + m;
}

// Calendar arithmetic on date strings (done in UTC so the time zone cannot shift the day).
const toUtc = (d) => new Date(d + "T00:00:00Z");
export const addDays = (d, n) => new Date(toUtc(d).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
export const weekday = (d) => toUtc(d).getUTCDay() || 7;   // Monday 1 ... Sunday 7
export const mondayOf = (d) => addDays(d, 1 - weekday(d));

export const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const formatDate = (d) => `${DAY_NAMES[weekday(d)]} ${d}`;

export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// Days a class meets between from and to (inclusive), from its weekly schedule and term dates.
export function scheduledDates(cls, from, to) {
  const days = new Set((cls.schedule || []).map((s) => s.weekday));
  const out = [];
  const start = from > cls.termStart ? from : cls.termStart;
  const end = to < cls.termEnd ? to : cls.termEnd;
  for (let d = start; d <= end; d = addDays(d, 1)) if (days.has(weekday(d))) out.push(d);
  return out;
}

// Sessions that have already ended (in Jakarta time) and so need attendance.
export function endedSessions(cls, now = Date.now()) {
  const d = dateOf(now);
  const mins = minutesNow(now);
  return scheduledDates(cls, cls.termStart, d).filter((date) => {
    if (date < d) return true;
    const slot = cls.schedule.find((s) => s.weekday === weekday(date));
    return mins >= toMinutes(slot.start) + slot.minutes;
  });
}

// The class's sessions in the current Monday-to-Sunday week.
export const sessionsThisWeek = (cls, now = Date.now()) => {
  const mon = mondayOf(dateOf(now));
  return scheduledDates(cls, mon, addDays(mon, 6));
};

export function slotFor(cls, date) {
  return cls.schedule.find((s) => s.weekday === weekday(date));
}

export const ago = (t) => {
  const days = Math.floor((Date.now() - toMillis(t)) / 86_400_000);
  if (days >= 1) return `${days} d`;
  const hours = Math.floor((Date.now() - toMillis(t)) / 3_600_000);
  return hours >= 1 ? `${hours} h` : `${Math.max(1, Math.floor((Date.now() - toMillis(t)) / 60_000))} min`;
};
