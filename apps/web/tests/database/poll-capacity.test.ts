import { randomUUID } from "node:crypto";
import { prisma } from "@rallly/database";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Keep real PostgreSQL transactions, row locks, votes and activity records.
// Only request-bound cache invalidation and external dispatch are replaced.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/features/webhook/mutations", () => ({
  scheduleWebhookDispatch: vi.fn(),
}));

import { hasPollAdminAccess } from "@/features/poll/data";
import { setPollOptionCapacity } from "@/features/poll/mutations";
import {
  addParticipant,
  deleteParticipant,
  updateParticipantVotes,
} from "@/features/poll/participant/mutations";

const databaseTests = process.env.POLL_CAPACITY_DATABASE_TESTS === "1";

describe.runIf(databaseTests)("per-option capacity with PostgreSQL", () => {
  const prefix = `capacity-${randomUUID()}`;
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Quota test", email: `${prefix}@example.com` },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.poll.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createPoll(capacity: number | null = 1) {
    return prisma.poll.create({
      data: {
        id: `${prefix}-${randomUUID()}`,
        title: "Capacity test",
        userId,
        maxParticipantsPerOption: capacity,
        options: {
          create: [
            { startTime: new Date("2030-01-01T12:00:00Z") },
            { startTime: new Date("2030-01-02T12:00:00Z") },
          ],
        },
      },
      include: { options: true },
    });
  }

  function respond(
    pollId: string,
    optionId: string,
    type: "yes" | "no" | "ifNeedBe" = "yes",
  ) {
    return addParticipant({
      pollId,
      userId,
      name: "Participant",
      locale: "en",
      votes: [{ optionId, type }],
    });
  }

  it("only grants quota management to a poll manager", async () => {
    const poll = await createPoll();
    expect(await hasPollAdminAccess(poll.id, userId)).toBe(true);
    expect(await hasPollAdminAccess(poll.id, "unrelated-user")).toBe(false);
  });

  it("does not change capacity on a closed poll", async () => {
    const poll = await createPoll();
    await prisma.poll.update({
      where: { id: poll.id },
      data: { status: "closed" },
    });
    expect(
      await setPollOptionCapacity({
        pollId: poll.id,
        maxParticipantsPerOption: 2,
      }),
    ).toEqual({ ok: false, reason: "closed" });
  });

  it("allows unlimited responses by default", async () => {
    const poll = await createPoll(null);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => respond(poll.id, poll.options[0].id)),
    );
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("enforces a separate quota on each option and does not count tentative/no votes", async () => {
    const poll = await createPoll();
    expect((await respond(poll.id, poll.options[0].id)).ok).toBe(true);
    expect(await respond(poll.id, poll.options[0].id)).toEqual({
      ok: false,
      reason: "optionFull",
    });
    expect((await respond(poll.id, poll.options[1].id)).ok).toBe(true);
    expect((await respond(poll.id, poll.options[0].id, "ifNeedBe")).ok).toBe(
      true,
    );
    expect((await respond(poll.id, poll.options[0].id, "no")).ok).toBe(true);
  });

  it("serializes simultaneous attempts at the last place", async () => {
    const poll = await createPoll(2);
    await respond(poll.id, poll.options[0].id);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => respond(poll.id, poll.options[0].id)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => !result.ok && result.reason === "optionFull"),
    ).toHaveLength(5);
    expect(
      await prisma.vote.count({ where: { pollId: poll.id, type: "yes" } }),
    ).toBe(2);
  });

  it("keeps an existing yes and releases a place when it changes to no", async () => {
    const poll = await createPoll();
    const response = await respond(poll.id, poll.options[0].id);
    if (!response.ok) throw new Error("Fixture failed");
    const input = {
      participantId: response.participant.id,
      pollId: poll.id,
      actorUserId: userId,
    };
    expect(
      await updateParticipantVotes({
        ...input,
        votes: [{ optionId: poll.options[0].id, type: "yes" }],
      }),
    ).toEqual({ ok: true });
    expect(
      await updateParticipantVotes({
        ...input,
        votes: [{ optionId: poll.options[0].id, type: "no" }],
      }),
    ).toEqual({ ok: true });
    expect((await respond(poll.id, poll.options[0].id)).ok).toBe(true);
  });

  it("rolls back the whole edit when moving into a full option", async () => {
    const poll = await createPoll();
    await respond(poll.id, poll.options[0].id);
    const response = await respond(poll.id, poll.options[1].id);
    if (!response.ok) throw new Error("Fixture failed");
    expect(
      await updateParticipantVotes({
        participantId: response.participant.id,
        pollId: poll.id,
        actorUserId: userId,
        votes: [
          { optionId: poll.options[0].id, type: "yes" },
          { optionId: poll.options[1].id, type: "no" },
        ],
      }),
    ).toEqual({ ok: false, reason: "optionFull" });
    const votes = await prisma.vote.findMany({
      where: { participantId: response.participant.id },
    });
    expect(votes.map(({ optionId, type }) => ({ optionId, type }))).toEqual([
      { optionId: poll.options[1].id, type: "yes" },
    ]);
  });

  it("releases a place after deleting a response", async () => {
    const poll = await createPoll();
    const response = await respond(poll.id, poll.options[0].id);
    if (!response.ok) throw new Error("Fixture failed");
    await deleteParticipant({
      participantId: response.participant.id,
      pollId: poll.id,
      actorUserId: userId,
    });
    expect((await respond(poll.id, poll.options[0].id)).ok).toBe(true);
  });

  it("rejects a quota below attendance without changing it, and allows removing it", async () => {
    const poll = await createPoll(null);
    await respond(poll.id, poll.options[0].id);
    await respond(poll.id, poll.options[0].id);
    expect(
      await setPollOptionCapacity({
        pollId: poll.id,
        maxParticipantsPerOption: 1,
      }),
    ).toEqual({ ok: false, reason: "belowAttendance" });
    expect(
      (await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } }))
        .maxParticipantsPerOption,
    ).toBeNull();
    expect(
      await setPollOptionCapacity({
        pollId: poll.id,
        maxParticipantsPerOption: 2,
      }),
    ).toEqual({ ok: true });
    expect(
      await setPollOptionCapacity({
        pollId: poll.id,
        maxParticipantsPerOption: null,
      }),
    ).toEqual({ ok: true });
    expect((await respond(poll.id, poll.options[0].id)).ok).toBe(true);
  });

  it("preserves the invariant when quota changes race with responses", async () => {
    const poll = await createPoll(null);
    await respond(poll.id, poll.options[0].id);
    await Promise.all([
      setPollOptionCapacity({ pollId: poll.id, maxParticipantsPerOption: 1 }),
      respond(poll.id, poll.options[0].id),
    ]);
    const saved = await prisma.poll.findUniqueOrThrow({
      where: { id: poll.id },
    });
    const count = await prisma.vote.count({
      where: { pollId: poll.id, type: "yes" },
    });
    expect(
      saved.maxParticipantsPerOption === null ||
        count <= saved.maxParticipantsPerOption,
    ).toBe(true);
  });
});
