import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PollOptionCapacity } from "@/features/poll/components/poll-option-capacity";
import { render, screen, waitFor } from "@/test/test-utils";

const { state, saveCapacity } = vi.hoisted(() => ({
  state: {
    role: "admin",
    guest: false,
    status: "open",
    capacity: 5 as number | null,
  },
  saveCapacity: vi.fn(async (_input: unknown) => ({ data: { ok: true } })),
}));

vi.mock("@/features/poll/actions", () => ({
  setPollOptionCapacityAction: saveCapacity,
}));
vi.mock("@/features/poll/client", () => ({
  usePoll: () => ({
    id: "poll",
    status: state.status,
    maxParticipantsPerOption: state.capacity,
  }),
  useRole: () => state.role,
}));
vi.mock("@/features/user/client", () => ({
  useUser: () => ({ user: { isGuest: state.guest } }),
}));

function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <PollOptionCapacity />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.assign(state, {
    role: "admin",
    guest: false,
    status: "open",
    capacity: 5,
  });
  saveCapacity.mockClear();
});

describe("PollOptionCapacity", () => {
  it("loads the saved quota and saves a new positive limit", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Slot capacity" }));
    const input = screen.getByRole("spinbutton", {
      name: "Maximum yes votes per time slot",
    });
    expect(input).toHaveValue(5);
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCapacity).toHaveBeenCalled());
    expect(saveCapacity.mock.calls[0][0]).toEqual({
      pollId: "poll",
      maxParticipantsPerOption: 3,
    });
  });

  it("clears the quota to unlimited", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Slot capacity" }));
    await user.clear(screen.getByRole("spinbutton"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveCapacity).toHaveBeenCalled());
    expect(saveCapacity.mock.calls[0][0]).toEqual({
      pollId: "poll",
      maxParticipantsPerOption: null,
    });
  });

  it("does not submit a zero quota", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Slot capacity" }));
    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "0");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(saveCapacity).not.toHaveBeenCalled();
  });

  it("hides management from participants", () => {
    state.role = "participant";
    show();
    expect(
      screen.queryByRole("button", { name: "Slot capacity" }),
    ).not.toBeInTheDocument();
  });

  it("hides management from guest sessions", () => {
    state.guest = true;
    show();
    expect(
      screen.queryByRole("button", { name: "Slot capacity" }),
    ).not.toBeInTheDocument();
  });

  it("disables changes on a closed poll with an explanation", () => {
    state.status = "closed";
    show();
    expect(
      screen.getByRole("button", { name: "Slot capacity" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Slot capacity" }),
    ).toHaveAttribute("title", "Capacity can only be changed on an open poll.");
  });
});
