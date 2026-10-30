"use server";

import { refresh } from "next/cache";

import { hasPollAdminAccess } from "@/features/poll/data";
import { setPollMuted, setPollOptionCapacity } from "@/features/poll/mutations";
import {
  setPollMutedSchema,
  setPollOptionCapacitySchema,
} from "@/features/poll/schema";
import { AppError } from "@/lib/errors/app-error";
import { identifyGroup, track } from "@/lib/posthog";
import { authActionClient } from "@/lib/safe-action/server";

export const setPollMutedAction = authActionClient
  .metadata({ actionName: "set_poll_muted" })
  .inputSchema(setPollMutedSchema)
  .action(async ({ ctx, parsedInput }) => {
    const { pollId, muted } = parsedInput;

    const result = await setPollMuted({
      pollId,
      userId: ctx.user.id,
      muted,
    });

    if (result.ok) {
      track(ctx.user, {
        event: "poll_notification:mute_update",
        properties: { poll_id: pollId, muted, source: "app" },
        groups: { poll: pollId },
      });
      identifyGroup({
        groupType: "poll",
        groupKey: pollId,
        properties: {
          muted,
        },
      });
    }

    refresh();

    return result;
  });

export const setPollOptionCapacityAction = authActionClient
  .metadata({ actionName: "set_poll_option_capacity" })
  .inputSchema(setPollOptionCapacitySchema)
  .action(async ({ ctx, parsedInput }) => {
    if (!(await hasPollAdminAccess(parsedInput.pollId, ctx.user.id))) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "You cannot manage this poll",
      });
    }
    const result = await setPollOptionCapacity(parsedInput);
    refresh();
    return result;
  });
