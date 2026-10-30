# Capacity per time slot

Implements the per-date quota requested in upstream Discussion #155:
https://github.com/lukevella/rallly/discussions/155

## Use

On a poll's management page, choose **Slot capacity**. Set a positive integer
(up to 10000), or leave the field blank for unlimited capacity. The same limit
applies independently to every option in that poll. Only **Yes** votes reserve
places; **If need be** and **No** do not. Existing polls remain unlimited.

Only signed-in poll managers can change the limit, and only while the poll is
open. Lowering it below an option's existing Yes votes is rejected without
changing the poll or any votes. Raising or removing the limit is supported.
Guest creators must register before managing capacity.

Participants see the configured limit. A response selecting a full option is
rejected with an explicit message. The response is kept in the form so it can be
corrected; no partial response is saved. Fullness is enforced at submission,
including for stale browser tabs. The interface does not reserve places while a
participant is filling in the form or automatically disable full options.

## Consistency

Response creation, response edits, response deletion and capacity changes lock
the same poll row in PostgreSQL. The occupancy check runs inside the transaction
after acquiring the lock. Consequently, concurrent requests cannot both take the
last place. On edits, the participant's old response is excluded from occupancy,
so keeping an existing Yes does not consume another place. Changing it to No or
deleting the response releases the place. Duplicate option IDs are rejected by
the response schemas.

The server action verifies poll management access using the same tenant-aware
`hasPollAdminAccess` rule as other management operations. Participant identity
and hidden scores are not exposed by the capacity notice or error.

## Migration

Run `pnpm db:generate` and `pnpm db:deploy` against the intended database before
starting the updated application. Back up an existing deployment first. The
migration adds a nullable column and a positive-value constraint; it does not
rewrite votes. Do not use `db:reset` on an existing deployment.

## Tests

Normal unit suite:

```sh
pnpm --filter @rallly/web test:unit
pnpm type-check
pnpm check
pnpm check:structure
pnpm check:locales
```

Database tests require a **separate disposable PostgreSQL database** with the
repository migrations applied. They create uniquely named users/polls and remove
those fixtures afterwards. Never point these tests at a production database.

```sh
# Set DATABASE_URL to your disposable database first.
pnpm db:deploy
POLL_CAPACITY_DATABASE_TESTS=1 pnpm --filter @rallly/web exec vitest run tests/database/poll-capacity.test.ts
```

The `Poll capacity database tests` CI job provisions PostgreSQL and runs these
checks automatically. The regular unit suite skips them when the explicit opt-in
variable is absent. Playwright ignores the database-only directory.

Coverage includes independent per-option limits, unlimited capacity, tentative
votes, concurrent last-place attempts, preserving/releasing an existing place,
atomic rejection of an edit, deletion, invalid limit reduction, concurrent quota
changes, manager access and closed polls. React tests cover editing/removing a
limit, invalid input and visibility. Schema tests cover invalid limits and
duplicate option IDs.

## Demo

1. Create a poll with two options and set capacity to 1.
2. Add a Yes response to the first option.
3. From another session, submit Yes for that option: submission is rejected.
4. Submit Yes for the second option: it succeeds.
5. Change the first response to No, then try the first option again: it succeeds.
6. Try reducing a limit below existing attendance: settings are unchanged.

This is a poll-wide default applied to each option, not individually different
limits per option, a waiting list, or a restriction to one choice per person.
Translations follow the repository's extraction/Crowdin workflow; only generated
English entries are included in this feature branch.
