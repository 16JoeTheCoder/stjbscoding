// App-wide settings. Change them here; nothing else hardcodes these numbers.

export const SCHOOL_DOMAIN = "stjbs.sch.id";
export const TIME_ZONE = "Asia/Jakarta";

// Python Run button: a program running longer than this is stopped.
export const RUN_TIMEOUT_MS = 5000;

// Pace feedback totals stay hidden until this many students have answered.
// Must match the number 5 in firestore.rules (match /pace/{date}).
export const PACE_MIN_RESPONSES = 5;

// Admin dashboard flags help requests still open after this many days.
export const HELP_STALE_DAYS = 3;

// Admin pages show a warning when the last export is older than this.
export const EXPORT_WARN_DAYS = 14;
