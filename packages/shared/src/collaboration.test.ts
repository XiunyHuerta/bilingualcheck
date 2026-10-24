import { describe, expect, it } from "vitest";
import { CollaborationBody, isMeetingUrl, localMeetingTime, meetingTransition, validMeetingTime } from "./collaboration";

describe("calls between client and professional", () => {
  it("requires the other person to confirm and prevents reopening a closed meeting", () => {
    expect(() => meetingTransition("proposed", "client", "client", "confirm")).toThrow();
    expect(meetingTransition("proposed", "client", "professional", "confirm")).toBe("confirmed");
    expect(meetingTransition("proposed", "professional", "client", "decline")).toBe("declined");
    expect(meetingTransition("confirmed", "client", "client", "cancel")).toBe("cancelled");
    expect(() => meetingTransition("cancelled", "client", "professional", "confirm")).toThrow();
    expect(() => meetingTransition("declined", "client", "professional", "share_link")).toThrow();
    expect(() => meetingTransition("confirmed", "professional", "client", "share_link")).toThrow();
  });
  it("accepts explicit time zones and rejects malformed dates and unreasonable durations", () => {
    const meeting = { kind: "meeting", message: "Review the campaign", starts_at: "2027-01-02T10:30:00-05:00", duration_minutes: 30 };
    expect(CollaborationBody.safeParse(meeting).success).toBe(true);
    expect(CollaborationBody.safeParse({ ...meeting, starts_at: "2027-02-30T10:00:00Z" }).success).toBe(false);
    expect(CollaborationBody.safeParse({ ...meeting, starts_at: "2027-01-02T10:30:00" }).success).toBe(false);
    expect(CollaborationBody.safeParse({ ...meeting, duration_minutes: 1 }).success).toBe(false);
    expect(validMeetingTime("2026-10-25T10:00:00Z", Date.parse("2026-10-24T10:00:00Z"))).toBe(true);
    expect(validMeetingTime("2026-10-23T10:00:00Z", Date.parse("2026-10-24T10:00:00Z"))).toBe(false);
    expect(localMeetingTime("2027-02-30 12:00")).toBeNull();
    expect(localMeetingTime("2027-02-02 25:00")).toBeNull();
    expect(localMeetingTime("2027-02-02 12:30")).toMatch(/^2027-02-02T/);
  });
  it("opens only approved HTTPS video providers", () => {
    for (const value of ["https://meet.google.com/abc", "https://us02web.zoom.us/j/123", "https://teams.microsoft.com/l/meetup-join/abc"]) expect(isMeetingUrl(value)).toBe(true);
    for (const value of ["javascript:alert(1)", "http://zoom.us/j/1", "https://zoom.us.evil.test", "https://zoom.us@evil.test", "https://evil.test/?next=meet.google.com", "https://zoom.us:8443/j/1"]) expect(isMeetingUrl(value)).toBe(false);
  });
});
