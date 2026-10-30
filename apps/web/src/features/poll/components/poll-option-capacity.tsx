"use client";

import { mutationOptions } from "@next-safe-action/adapter-tanstack-query";
import { passwordManagerIgnoreProps } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useDialog,
} from "@rallly/ui/dialog";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { toast } from "@rallly/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import { setPollOptionCapacityAction } from "@/features/poll/actions";
import { usePoll, useRole } from "@/features/poll/client";
import { pollOptionCapacitySchema } from "@/features/poll/schema";
import { useUser } from "@/features/user/client";
import { Trans, useTranslation } from "@/i18n/client";

export function PollOptionCapacity() {
  const poll = usePoll();
  const role = useRole();
  const { user } = useUser();
  const dialog = useDialog();
  const { t } = useTranslation();
  const [value, setValue] = React.useState("");
  const inputId = React.useId();
  const capacity = value === "" ? null : Number(value);
  const valid = pollOptionCapacitySchema.safeParse(capacity).success;
  const mutation = useMutation(
    mutationOptions(setPollOptionCapacityAction, {
      onSuccess: (result) => {
        if (result.ok) {
          dialog.dismiss();
        } else {
          toast.error(
            result.reason === "belowAttendance"
              ? t("pollOptionCapacityBelowAttendance", {
                  defaultValue:
                    "The limit cannot be lower than the number of existing yes votes on a time slot.",
                })
              : t("pollOptionCapacityUnavailable", {
                  defaultValue: "Capacity can only be changed on an open poll.",
                }),
          );
        }
      },
    }),
  );

  if (role !== "admin" || !user || user.isGuest) return null;

  return (
    <>
      <Button
        variant="default"
        disabled={poll.status !== "open"}
        title={
          poll.status !== "open"
            ? t("pollOptionCapacityUnavailable", {
                defaultValue: "Capacity can only be changed on an open poll.",
              })
            : undefined
        }
        onClick={() => {
          setValue(poll.maxParticipantsPerOption?.toString() ?? "");
          dialog.trigger();
        }}
      >
        <Trans i18nKey="pollOptionCapacityTitle" defaults="Slot capacity" />
      </Button>
      <Dialog {...dialog.dialogProps}>
        <DialogContent size="sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (valid)
                mutation.mutate({
                  pollId: poll.id,
                  maxParticipantsPerOption: capacity,
                });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <Trans
                  i18nKey="pollOptionCapacityTitle"
                  defaults="Slot capacity"
                />
              </DialogTitle>
              <DialogDescription>
                <Trans
                  i18nKey="pollOptionCapacityDescription"
                  defaults="Limit yes votes on each time slot. Tentative votes do not reserve a place. Leave blank for unlimited capacity."
                />
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 p-4">
              <Label htmlFor={inputId}>
                <Trans
                  i18nKey="pollOptionCapacityLabel"
                  defaults="Maximum yes votes per time slot"
                />
              </Label>
              <Input
                {...passwordManagerIgnoreProps}
                id={inputId}
                type="number"
                min={1}
                max={10000}
                step={1}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => dialog.dismiss()}>
                <Trans i18nKey="cancel" defaults="Cancel" />
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!valid}
                loading={mutation.isPending}
              >
                <Trans i18nKey="save" defaults="Save" />
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
