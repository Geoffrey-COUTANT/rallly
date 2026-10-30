import { randomUUID } from "node:crypto";
import { prisma } from "@rallly/database";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/features/webhook/mutations", () => ({
  scheduleWebhookDispatch: vi.fn(),
}));

import {
  addParticipant,
  updateParticipantVotes,
} from "@/features/poll/participant/mutations";

const enabled = process.env.POLL_PAST_DATABASE_TESTS === "1";
const NOW = new Date("2030-06-15T12:00:00Z");

describe.runIf(enabled)("past option votes with PostgreSQL", () => {
  const prefix = `past-${randomUUID()}`;
  let userId: string;

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { name: "Past votes test", email: `${prefix}@example.com` },
      })
    ).id;
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await prisma.poll.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function fixture(duration = 60, timeZone: string | null = "UTC") {
    return prisma.poll.create({
      data: {
        id: `${prefix}-${randomUUID()}`,
        title: "Past votes test",
        userId,
        timeZone,
        options: {
          create: [
            { startTime: new Date("2030-06-14T00:00:00Z"), duration },
            { startTime: new Date("2030-06-16T00:00:00Z"), duration },
          ],
        },
      },
      include: { options: { orderBy: { startTime: "asc" } } },
    });
  }
  function respond(
    pollId: string,
    votes: { optionId: string; type: "yes" | "no" | "ifNeedBe" }[],
  ) {
    return addParticipant({
      pollId,
      userId,
      locale: "en",
      name: "Test response",
      votes,
    });
  }

  it.each([
    "yes",
    "ifNeedBe",
  ] as const)("rejects a forged %s on a past option atomically", async (type) => {
    const poll = await fixture();
    expect(
      await respond(poll.id, [
        { optionId: poll.options[0].id, type },
        { optionId: poll.options[1].id, type: "yes" },
      ]),
    ).toEqual({ ok: false, reason: "pastOption" });
    expect(await prisma.participant.count({ where: { pollId: poll.id } })).toBe(
      0,
    );
    expect(await prisma.vote.count({ where: { pollId: poll.id } })).toBe(0);
  });

  it("ignores normalized No placeholders on past options", async () => {
    const poll = await fixture();
    const result = await respond(poll.id, [
      { optionId: poll.options[0].id, type: "no" },
      { optionId: poll.options[1].id, type: "yes" },
    ]);
    expect(result.ok).toBe(true);
    const votes = await prisma.vote.findMany({ where: { pollId: poll.id } });
    expect(votes.map((vote) => vote.optionId)).toEqual([poll.options[1].id]);
  });

  it("rejects responses if every option has passed", async () => {
    const poll = await fixture();
    vi.setSystemTime(new Date("2030-06-17T00:00:00Z"));
    expect(
      await respond(
        poll.id,
        poll.options.map((option) => ({ optionId: option.id, type: "no" })),
      ),
    ).toEqual({ ok: false, reason: "pastOption" });
  });

  it("freezes a timed slot at its start, even before its end", async () => {
    const poll = await fixture();
    vi.setSystemTime(poll.options[1].startTime);
    expect(
      await respond(poll.id, [{ optionId: poll.options[1].id, type: "yes" }]),
    ).toEqual({ ok: false, reason: "pastOption" });
  });

  it("uses the poll timezone for an all-day boundary", async () => {
    const poll = await fixture(0, "America/Los_Angeles");
    vi.setSystemTime(new Date("2030-06-17T01:00:00Z")); // Still June 16 in Los Angeles.
    expect(
      (await respond(poll.id, [{ optionId: poll.options[1].id, type: "yes" }]))
        .ok,
    ).toBe(true);
    vi.setSystemTime(new Date("2030-06-17T07:00:00Z"));
    expect(
      await respond(poll.id, [{ optionId: poll.options[1].id, type: "yes" }]),
    ).toEqual({ ok: false, reason: "pastOption" });
  });

  it("preserves omitted historical votes while editing a future option", async () => {
    const poll = await fixture();
    const response = await prisma.participant.create({
      data: {
        name: "Historical response",
        pollId: poll.id,
        token: randomUUID(),
        votes: {
          create: {
            pollId: poll.id,
            optionId: poll.options[0].id,
            type: "yes",
          },
        },
      },
    });
    expect(
      await updateParticipantVotes({
        participantId: response.id,
        pollId: poll.id,
        actorUserId: userId,
        votes: [{ optionId: poll.options[1].id, type: "yes" }],
      }),
    ).toEqual({ ok: true });
    expect(
      await prisma.vote.count({
        where: { participantId: response.id, type: "yes" },
      }),
    ).toBe(2);
  });

  it("accepts an unchanged historical vote, but rolls back an attempted change", async () => {
    const poll = await fixture();
    const response = await prisma.participant.create({
      data: {
        name: "Historical response",
        pollId: poll.id,
        token: randomUUID(),
        votes: {
          create: {
            pollId: poll.id,
            optionId: poll.options[0].id,
            type: "yes",
          },
        },
      },
    });
    const input = {
      participantId: response.id,
      pollId: poll.id,
      actorUserId: userId,
    };
    expect(
      await updateParticipantVotes({
        ...input,
        votes: [
          { optionId: poll.options[0].id, type: "yes" },
          { optionId: poll.options[1].id, type: "ifNeedBe" },
        ],
      }),
    ).toEqual({ ok: true });
    expect(
      await updateParticipantVotes({
        ...input,
        votes: [
          { optionId: poll.options[0].id, type: "no" },
          { optionId: poll.options[1].id, type: "yes" },
        ],
      }),
    ).toEqual({ ok: false, reason: "pastOption" });
    const historical = await prisma.vote.findFirstOrThrow({
      where: { participantId: response.id, optionId: poll.options[0].id },
    });
    expect(historical.type).toBe("yes");
    const future = await prisma.vote.findFirstOrThrow({
      where: { participantId: response.id, optionId: poll.options[1].id },
    });
    expect(future.type).toBe("ifNeedBe");
  });

  it("checks the clock after waiting for a poll-row lock", async () => {
    const poll = await fixture();
    let holderPid = 0;
    let unlock!: () => void;
    let acquired!: () => void;
    const released = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const holder = prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid FROM polls WHERE id = ${poll.id} FOR UPDATE`;
      holderPid = row.pid;
      acquired();
      await released;
    });
    await locked;
    try {
      const pending = respond(poll.id, [
        { optionId: poll.options[1].id, type: "yes" },
      ]);
      // Wait until PostgreSQL confirms the response is blocked on this
      // holder, rather than relying on timing or merely starting a Promise.
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE ${holderPid}::int = ANY(pg_blocking_pids(pid))) AS waiting
        `;
        if (row.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      vi.setSystemTime(new Date("2030-06-16T00:01:00Z"));
      unlock();
      await holder;
      expect(await pending).toEqual({ ok: false, reason: "pastOption" });
    } finally {
      unlock();
      await holder;
    }
  });
});
