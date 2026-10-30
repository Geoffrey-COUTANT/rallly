"use client";
import React from "react";
import { useRequiredContext } from "@/components/use-required-context";
import type {
  PollComment,
  PollDetails,
  PollParticipant,
} from "@/features/poll/types";
import { isPollOptionPast } from "@/features/poll/utils";
import { useUser } from "@/features/user/client";
import { Trans, useTranslation } from "@/i18n/client";

type PollContextValue = {
  poll: PollDetails;
  participants: PollParticipant[];
  comments: PollComment[];
  /**
   * Responses the emailed link in the URL may edit, resolved on the server
   * from the same token the actions check.
   */
  linkedParticipantIds: string[];
  /** Which surface the page is: the host's admin page or the invite page. */
  viewerRole: "admin" | "participant";
};

const PollContext = React.createContext<PollContextValue | null>(null);

PollContext.displayName = "PollProvider";

/**
 * Serves the poll a page loaded on the server. Writes go through server
 * actions followed by router.refresh(), which re-renders the page with new
 * props; nothing here is patched on the client.
 */
export function PollProvider({
  poll,
  participants,
  comments,
  linkedParticipantIds = [],
  viewerRole,
  children,
}: Omit<PollContextValue, "linkedParticipantIds"> & {
  linkedParticipantIds?: string[];
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ poll, participants, comments, linkedParticipantIds, viewerRole }),
    [poll, participants, comments, linkedParticipantIds, viewerRole],
  );

  return <PollContext.Provider value={value}>{children}</PollContext.Provider>;
}

export const usePoll = () => useRequiredContext(PollContext).poll;

/** The poll when a provider is mounted, for components shared with pages
 * that pass their data as props instead. */
export const usePollOrNull = () => React.useContext(PollContext)?.poll ?? null;

export const useRole = () => useRequiredContext(PollContext).viewerRole;

export const useComments = () => useRequiredContext(PollContext).comments;

export const useParticipants = () => {
  const { t } = useTranslation();
  const { participants: rawParticipants } = useRequiredContext(PollContext);

  const participants = React.useMemo(() => {
    return rawParticipants.map((participant, index) => {
      if (!participant.hidden) {
        return participant;
      }

      return {
        ...participant,
        name: t("hiddenParticipantName", {
          defaultValue: "Participant #{number}",
          number: rawParticipants.length - index,
        }),
      };
    });
  }, [rawParticipants, t]);

  return { participants };
};

export const usePermissions = () => {
  const { poll, participants, linkedParticipantIds, viewerRole } =
    useRequiredContext(PollContext);
  const { user } = useUser();

  return {
    canAddNewParticipant: poll.status === "open",
    canEditParticipant: (participantId: string) => {
      if (poll.status !== "open") {
        return false;
      }

      if (viewerRole === "admin") {
        return true;
      }

      const participant = participants.find(
        (participant) => participant.id === participantId,
      );

      if (!participant) {
        return false;
      }

      return (
        (!!user && participant.userId === user.id) ||
        linkedParticipantIds.includes(participantId)
      );
    },
  };
};

const PastPollOptionsContext = React.createContext<ReadonlySet<string>>(
  new Set(),
);

/** Shared by list, calendar, week and host editors. Wait for hydration before
 * reading the clock and refresh on focus as suspended tabs resume.
 */
export function PollVotingAvailabilityProvider({
  options,
  timeZone,
  children,
}: {
  options: { id: string; startTime: Date; duration: number }[];
  timeZone: string | null;
  children: React.ReactNode;
}) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const past = React.useMemo(
    () =>
      new Set(
        options
          .filter((option) => !now || isPollOptionPast(option, timeZone, now))
          .map((option) => option.id),
      ),
    [options, timeZone, now],
  );
  return (
    <PastPollOptionsContext.Provider value={past}>
      {now && past.size > 0 ? (
        <p className="px-4 py-2 text-muted-foreground text-sm" role="note">
          <Trans
            i18nKey="pastPollOptionsNotice"
            defaults="Past options are read-only. Previously saved votes are kept."
          />
        </p>
      ) : null}
      {children}
    </PastPollOptionsContext.Provider>
  );
}

export function usePastPollOptions() {
  return React.useContext(PastPollOptionsContext);
}

export function useIsPastPollOption(optionId: string) {
  return usePastPollOptions().has(optionId);
}
