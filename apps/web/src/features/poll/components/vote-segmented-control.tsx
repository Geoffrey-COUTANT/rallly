"use client";
import { cn } from "@rallly/ui";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@rallly/ui/segmented-control";

import { getVoteTypes } from "@/features/poll/constants";
import { useTranslation } from "@/i18n/client";

import VoteIcon from "./vote-icon";

type VoteType = "yes" | "ifNeedBe" | "no";

export const VoteSegmentedControl = ({
  value,
  onChange,
  optionLabel,
  disabledReason,
  allowTentativeVotes = true,
  className,
}: {
  value?: VoteType;
  disabledReason?: string;
  onChange: (value: VoteType) => void;
  className?: string;
  /** When false only yes and no are offered. */
  allowTentativeVotes?: boolean;
  /**
   * Accessible description of the option being voted on (e.g. "Tue 30 Jun
   * 2026, 1:00 PM – 2:00 PM") so screen readers can tie the vote to its
   * date/time.
   */
  optionLabel?: string;
}) => {
  const { t } = useTranslation();
  const voteTypes = getVoteTypes(allowTentativeVotes);

  const voteLabels: Record<VoteType, string> = {
    yes: t("yes", { defaultValue: "Yes" }),
    ifNeedBe: t("ifNeedBe", { defaultValue: "If need be" }),
    no: t("no", { defaultValue: "No" }),
  };

  return (
    <SegmentedControl
      data-testid="vote-selector"
      aria-label={optionLabel}
      title={disabledReason}
      disabled={!!disabledReason}
      // Touch-sized below sm; from there it matches a default button.
      className={cn("h-11 sm:h-9", disabledReason && "opacity-50", className)}
      value={value ?? null}
      onValueChange={(newValue) => {
        if (newValue && !disabledReason) {
          onChange(newValue as VoteType);
        }
      }}
    >
      {voteTypes.map((type) => (
        <SegmentedControlItem
          key={type}
          value={type}
          disabled={!!disabledReason}
          aria-label={voteLabels[type]}
          className="w-11 data-disabled:cursor-not-allowed sm:w-9 data-unchecked:[&_svg]:text-gray-400 dark:data-unchecked:[&_svg]:text-gray-600"
        >
          <VoteIcon type={type} />
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
};
