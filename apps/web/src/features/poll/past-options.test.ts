import { describe, expect, it } from "vitest";
import { isPollOptionPast } from "./utils";

const NOW = new Date("2030-06-15T12:00:00Z");

describe("isPollOptionPast", () => {
  it.each([
    ["2030-06-15T11:59:59Z", true],
    ["2030-06-15T12:00:00Z", true],
    ["2030-06-15T12:00:01Z", false],
  ])("classifies a timed option starting at %s", (start, expected) => {
    expect(
      isPollOptionPast(
        { startTime: new Date(start), duration: 60 },
        "Europe/Paris",
        NOW,
      ),
    ).toBe(expected);
  });

  it("freezes an in-progress slot as soon as it starts", () => {
    expect(
      isPollOptionPast(
        { startTime: new Date("2030-06-15T11:45:00Z"), duration: 120 },
        null,
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps an all-day option open until its calendar day ends", () => {
    const option = { startTime: new Date("2030-06-15T00:00:00Z"), duration: 0 };
    expect(
      isPollOptionPast(option, "UTC", new Date("2030-06-15T23:59:59Z")),
    ).toBe(false);
    expect(
      isPollOptionPast(option, "UTC", new Date("2030-06-16T00:00:00Z")),
    ).toBe(true);
  });

  it("uses the poll's calendar day rather than the viewer or server zone", () => {
    const option = { startTime: new Date("2030-06-15T00:00:00Z"), duration: 0 };
    const now = new Date("2030-06-16T01:00:00Z");
    expect(isPollOptionPast(option, "America/Los_Angeles", now)).toBe(false);
    expect(isPollOptionPast(option, "Asia/Tokyo", now)).toBe(true);
  });

  it.each([
    null,
    "not-a-time-zone",
  ])("falls back to UTC for zone %s", (zone) => {
    expect(
      isPollOptionPast(
        { startTime: new Date("2030-06-15T00:00:00Z"), duration: 0 },
        zone,
        new Date("2030-06-16T00:00:00Z"),
      ),
    ).toBe(true);
  });
});
