import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PollVotingAvailabilityProvider,
  useIsPastPollOption,
} from "@/features/poll/client";
import { VoteSegmentedControl } from "@/features/poll/components/vote-segmented-control";
import { VoteSelector } from "@/features/poll/components/vote-selector";
import { render, screen } from "@/test/test-utils";

vi.mock("@/features/user/client", () => ({ useUser: () => ({ user: null }) }));

const START = new Date("2030-06-15T12:00:00Z");

function Controls({ onChange }: { onChange: () => void }) {
  const past = useIsPastPollOption("option");
  const disabledReason = past
    ? "This option is in the past and cannot be changed."
    : undefined;
  return (
    <>
      <VoteSelector
        optionLabel="Host vote"
        disabledReason={disabledReason}
        onChange={onChange}
      />
      <VoteSegmentedControl
        optionLabel="Participant vote"
        disabledReason={disabledReason}
        onChange={onChange}
      />
    </>
  );
}

function show(onChange: () => void) {
  return render(
    <PollVotingAvailabilityProvider
      options={[{ id: "option", startTime: START, duration: 60 }]}
      timeZone="UTC"
    >
      <Controls onChange={onChange} />
    </PollVotingAvailabilityProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
});
afterEach(() => vi.useRealTimers());

describe("past option controls", () => {
  it("disables both host and participant controls for an expired option", () => {
    vi.setSystemTime(new Date("2030-06-15T12:00:01Z"));
    const onChange = vi.fn();
    show(onChange);
    const host = screen.getByRole("button", { name: /Host vote/ });
    expect(host).toBeDisabled();
    expect(host).toHaveAttribute(
      "title",
      "This option is in the past and cannot be changed.",
    );
    fireEvent.click(host);
    const participantButtons = screen.getAllByRole("radio");
    for (const button of participantButtons) {
      expect(button).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps future controls enabled and freezes them when their start passes", () => {
    vi.setSystemTime(new Date("2030-06-15T11:59:59Z"));
    show(vi.fn());
    expect(screen.getByRole("button", { name: /Host vote/ })).toBeEnabled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: /Host vote/ })).toBeDisabled();
    expect(
      screen
        .getAllByRole("radio")
        .every((button) => button.getAttribute("aria-disabled") === "true"),
    ).toBe(true);
  });

  it("refreshes the boundary when a suspended tab regains focus", () => {
    vi.setSystemTime(new Date("2030-06-15T11:59:00Z"));
    show(vi.fn());
    expect(screen.getByRole("button", { name: /Host vote/ })).toBeEnabled();
    vi.setSystemTime(new Date("2030-06-15T12:01:00Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByRole("button", { name: /Host vote/ })).toBeDisabled();
  });
});
