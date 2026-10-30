# Read-only past options

Past dates and time slots can no longer receive new votes. This implements the
request described in https://github.com/lukevella/rallly/issues/1677.

## Behavior

A timed option becomes read-only at its start time, including equality. An
already-started slot is read-only even if its end time is still in the future.
An all-day option remains available throughout its calendar day in the poll's
time zone and becomes read-only the following day. Missing or invalid poll time
zones use UTC; timed options without a time zone are interpreted in UTC too.
The viewer's time zone does not change the cutoff.

List, week, calendar, mobile and host response editors disable expired choices
and explain that saved votes are kept. Availability refreshes every second and
when a suspended tab regains focus. A stale tab or forged request cannot bypass
the server check.

New responses cannot select Yes or If need be on a past option. Forms normalize
unanswered choices to No: these placeholders are ignored for past options and
are not saved. A poll with no future options rejects new responses.

Editing a response preserves its historical votes, including when the submitted
form omits them. Submitting the same historical value is accepted; changing one
is rejected atomically. Other future votes can still be edited. Existing response
deletion and name changes remain available under the usual permissions.

## Consistency and deployment

The server reads the clock after acquiring the poll row lock, inside the same
transaction as the existing quota checks. A request waiting on another writer
cannot use an outdated timestamp to vote after the cutoff. A failed validation
saves no partial response. No database migration is required for this feature.

## Validation

```sh
pnpm --filter @rallly/web test:unit
pnpm type-check
pnpm check
pnpm check:structure
pnpm check:locales
pnpm check:cascades
```

For database tests, use a separate disposable PostgreSQL database with the
repository migrations applied. Set DATABASE_URL to that database before running:

```sh
pnpm db:deploy
POLL_PAST_DATABASE_TESTS=1 POLL_CAPACITY_DATABASE_TESTS=1 pnpm --filter @rallly/web exec vitest run tests/database/past-option-votes.test.ts tests/database/poll-capacity.test.ts
```

The existing PostgreSQL CI job runs both suites. Ordinary unit runs skip the
opt-in database tests. Coverage includes exact start times, ongoing slots,
all-day time zones and UTC fallback, browser clock refresh and focus, forged
requests, atomic rejection, historical vote preservation and expiration while
waiting for a real database lock. The capacity suite checks the first feature
still works with these changes.

## Manual demo

1. Create a poll with yesterday, today and tomorrow as all-day options.
2. Verify yesterday is read-only and today/tomorrow remain selectable.
3. Submit a response for tomorrow, then edit it; past choices stay read-only.
4. For a timed poll, choose a start a minute in the future and leave the voting
   page open. The choice becomes read-only at its start without reloading.
5. Save a vote before that start, then edit another future vote afterwards.
   The historical vote remains unchanged.

Translations follow the repository extraction workflow; only generated English
entries are included in the branch.
