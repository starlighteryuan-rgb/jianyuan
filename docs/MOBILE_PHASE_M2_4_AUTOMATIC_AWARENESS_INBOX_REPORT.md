# Mobile Phase M2.4 - Automatic Awareness Inbox Report

Status: DONE

## AUTOMATION POLICY

Mobile has one explicit runtime preference:

- label: `保存记录后自动觉察`
- default: OFF
- storage: `jianyuan.awareness.preferences.v1`
- owner: Mobile Runtime Preference
- not a Core Directive, Record, Reflection, Relation, Evidence, or user fact

The preference controls application orchestration only. It does not change
Record semantics and does not add a Core schema field.

## SETTING

Settings shows the preference and explains that automatic Awareness may increase
AI calls and cost. Turning it OFF cancels the current quiet-window timer. Turning
it ON allows later Record saves to schedule automatic checks.

## RECORD SAVE TRIGGER

The capture path remains local-first:

1. Ingestion commits the Record to Mobile SQLite.
2. `MobileRuntime.capture` returns success.
3. Only after a successful local save does the runtime enqueue the Record for a
   possible automatic check.

AI failure, timeout, missing key, or malformed output cannot roll back or block
the Record. The saved Record remains available.

## ASYNC ORCHESTRATION

Automatic Awareness uses a trailing quiet window of 8 seconds.

- A successful Record save adds its id to the pending batch.
- Each later save in the same window resets the timer.
- When the user stops recording, one automatic job runs for the pending batch.
- A long Record remains one Record; the runtime does not split it by sentence.
- Manual Awareness remains immediate and does not wait for the quiet window.

The runtime does not add a user-visible "check after N records" rule and does not
add a second setting.

## JOB STATE

Automatic orchestration persists operational state under
`jianyuan.awareness.automation.v1`:

- `pendingRecordIds`
- `coveredRecordIds`
- job records with `queued | running | completed | no_observation | failed`

This state is operational. It never becomes an accepted Core fact.

## M2.2 SURFACING INTEGRATION

Automatic checks call the existing `suggestRelations` pipeline. They do not
introduce a second AI judgment path and do not weaken the conservative gate.
Weak same-day, close-time, or generic signals still return `NO_OBSERVATION`.

If the available context has fewer than two analysable Records, the existing
pipeline returns `not_enough_context`. The automatic job treats that as a
successful `no_observation`, because the Provider privacy contract requires at
least two selected Records for a relation request. No Provider request and no
Bubble are created for that case.

## M2.3 ADAPTIVE OUTPUT INTEGRATION

Bubble preview and detail use the observation returned by the existing pipeline.
Optional `question`, `explanation`, and `uncertainty` sections render only when
present. The inbox does not regenerate a summary or call AI again to explain a
Bubble.

## INBOX

The Awareness space is an inbox containing durable presentation history:

- `pending`: prepared by AI and not opened by the user
- `viewed`: opened by the user
- `reflected`: the user wrote their own free text and the existing Reflection flow ran
- `dismissed`: the user chose `这不是我的体验`

Pending items have the strongest presentation weight. Viewed, reflected, and
dismissed items remain available in a lower-weight history area. Pending
Observations are not Relations, Evidence, or user conclusions.

## BUBBLE

The functional Bubble shows:

- `新的觉察`
- the Provider observation preview
- capture time

The Bubble is intentionally not the final M3 visual design. It is a real product
surface backed by real inbox state, not a debug list or a fake placeholder.

## BADGE

The Awareness Bottom Tab reads `MobileRuntime.unreadAwarenessCount()`. The count
is derived from real `pending` history items and is not component-local fake
state. Subscribers receive updates when history changes.

## READ STATE

Opening the Awareness Tab does not mark all items viewed. Only opening a concrete
Bubble calls `markAwarenessViewed`, changing that item from `pending` to
`viewed`. The badge decreases only for that item.

## PERSISTENCE

Awareness history and automatic job state use durable key/value storage:

- awareness history: `jianyuan.awareness.history.v1`
- automation state: `jianyuan.awareness.automation.v1`
- preference: `jianyuan.awareness.preferences.v1`

Pending and viewed states survive a runtime restart. A pending automatic batch
also survives process death and can be continued on the next foreground drain.
Interrupted `running` jobs are recovered as `queued` without producing partial
facts.

## IDEMPOTENCY

Automatic jobs have a stable job id and Record batch boundary. Candidate
insertion checks both `automationJobId` and the suggestion record refs plus
observation. Retrying a job therefore does not create duplicate Bubbles.

`coveredRecordIds` prevents already-successful automatic checks from being
unreasonably re-enqueued. Manual Awareness retains its separate explicit request
path.

## MANUAL AWARENESS COMPATIBILITY

Automatic and manual Awareness share the same Provider and response behavior,
but manual Awareness remains immediately runnable while automatic mode is ON and
does not wait for the quiet window.

## REFLECTION BOUNDARY

Quick responses remain non-Core:

- `很接近`
- `有一点像`
- `这不是我的体验`

Only free text can proceed through the existing Reflection / Core Gate. The
runtime does not auto-select a response, auto-confirm a Relation, or create
Evidence on the user's behalf.

## DEGRADED MODE

When AI is not configured, automatic mode remains enabled as a preference but the
job completes without a Provider request or fake Bubble. Records continue to
save locally. Settings and Awareness can surface low-distraction degraded state.

Provider timeout, HTTP failure, invalid model, malformed output, and language
validation failure do not affect already-saved Records and do not create an
inbox item.

## TESTS

Automated verification on the current checkout:

- Mobile tests: 97 passed / 97
- Mobile typecheck: PASS
- Root tests: 857 passed / 857
- Root typecheck: PASS
- Desktop tests: 16 passed / 16
- Desktop typecheck: PASS
- Provider tests: 20 passed / 20
- Provider check: PASS

M2.4 tests cover:

- OFF save does not call Provider
- five rapid saves all persist and produce one quiet-window check
- one Record save schedules one local automatic check without violating the
  two-Record Provider privacy contract
- Manual Awareness stays immediate
- Provider failure leaves the Record and creates no fake Bubble
- malformed response creates no fake Bubble
- pending and viewed states survive restart
- pending batch survives process death and resumes on foreground drain
- a batch saved while an earlier automatic check is still running drains after
  the first check instead of being stranded
- one automatic job is used for one pending batch
- retrying a job does not duplicate a Bubble
- a crash after Bubble write but before job completion recovers the same job as
  completed without a second Provider call or duplicate Bubble
- quick response does not create Relation or Evidence
- UI badge is real, entering the Tab does not mark items read, and opening one
  Bubble clears only that item's unread state
- no API key still allows local Record save

## REAL DEVICE ACCEPTANCE

The unsigned IPA workflow remains the delivery path for real-device checks. The
device flow to verify after installation is:

1. Open Settings and enable `保存记录后自动觉察`.
2. Save two or more structurally related Records.
3. Confirm Record saves return immediately.
4. Wait for the quiet window.
5. Confirm the Awareness Tab badge appears only when a real Bubble is surfaced.
6. Open the Awareness Tab and confirm the badge remains.
7. Open one Bubble and confirm its unread state clears.
8. Kill and reopen the app and confirm pending/viewed state persists.

This report records the code and automated contract. The unsigned IPA device run
is still required for final native acceptance.

## KNOWN LIMITATIONS

- Automatic scheduling is foreground/runtime orchestration; iOS background task
  execution is not implemented in M2.4.
- A single Record cannot legally trigger the current Provider request because the
  Provider privacy contract requires at least two selected Records. It settles
  locally as `no_observation`.
- M2.4 still uses functional Bubble presentation. Final spatial design, ripple,
  motion, and gesture language belong to M3.
- `react-test-renderer` emits its upstream deprecation warning; this does not
  affect the test result.

## M3 HANDOFF

M3 can build the Awareness Space, Bubble, unread indication, transitions, and
gestures on top of real persisted inbox data. M3 does not need to change Core
semantics, Record persistence, Provider contracts, or the automatic job state
model.
