import { test } from "node:test";
import assert from "node:assert/strict";
import { dateOf, addDays, weekday, mondayOf, scheduledDates, endedSessions, daysBetween } from "../../src/time.js";

const cls = { termStart: "2026-07-13", termEnd: "2026-07-31", schedule: [{ weekday: 2, start: "15:00", minutes: 60 }, { weekday: 4, start: "15:00", minutes: 60 }] };

test("dates are in Jakarta time", () => {
  // 2026-07-14 18:30 UTC is 2026-07-15 01:30 in Jakarta
  assert.equal(dateOf(Date.UTC(2026, 6, 14, 18, 30)), "2026-07-15");
});

test("date arithmetic", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekday("2026-07-13"), 1);
  assert.equal(weekday("2026-07-19"), 7);
  assert.equal(mondayOf("2026-07-19"), "2026-07-13");
  assert.equal(daysBetween("2026-07-13", "2026-07-20"), 7);
});

test("scheduled dates follow weekdays within the term", () => {
  assert.deepEqual(scheduledDates(cls, "2026-07-01", "2026-07-20"), ["2026-07-14", "2026-07-16"]);
});

test("a session counts as ended only after its end time in Jakarta", () => {
  // Tue 2026-07-14, 15:30 Jakarta = 08:30 UTC: still running
  assert.deepEqual(endedSessions(cls, Date.UTC(2026, 6, 14, 8, 30)), []);
  // 16:00 Jakarta = 09:00 UTC: ended
  assert.deepEqual(endedSessions(cls, Date.UTC(2026, 6, 14, 9, 0)), ["2026-07-14"]);
});
