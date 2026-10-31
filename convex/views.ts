import { v } from "convex/values";
import schema from "./schema";
const session = v.object({
  _id: v.id("sessions"),
  _creationTime: v.number(),
  ...schema.tables.sessions.validator.fields,
});
const checkIn = v.object({
  _id: v.id("checkIns"),
  _creationTime: v.number(),
  ...schema.tables.checkIns.validator.fields,
});
const incident = v.object({
  _id: v.id("incidents"),
  _creationTime: v.number(),
  ...schema.tables.incidents.validator.fields,
});
const transcript = v.object({
  _id: v.id("transcripts"),
  _creationTime: v.number(),
  ...schema.tables.transcripts.validator.fields,
});
const event = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  ...schema.tables.events.validator.fields,
});
const { captionUrl, callId, toolToken, ...safeJob } =
  schema.tables.jobs.validator.fields;
export const sessionView = v.union(
  v.null(),
  v.object({
    session,
    checkIn: v.union(v.null(), checkIn),
    incident: v.union(v.null(), incident),
    delivery: v.array(
      v.object({ _id: v.id("jobs"), _creationTime: v.number(), ...safeJob }),
    ),
    transcripts: v.array(transcript),
    events: v.array(event),
  }),
);
export const claimedJob = v.union(
  v.null(),
  v.object({
    _id: v.id("jobs"),
    _creationTime: v.number(),
    ...schema.tables.jobs.validator.fields,
    mode: v.union(v.literal("demo"), v.literal("live")),
  }),
);
