import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily(
  "purge conversation data older than 24h",
  { hourUTC: 21, minuteUTC: 0 },
  internal.sessions.purge,
  {},
);
export default crons;
