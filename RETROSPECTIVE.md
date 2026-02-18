# Vanessa Voice POC Retrospective

## Scope

This retrospective is based on tracked git history in this repository:

- `1be57fd` (2025-10-09): **Working flow POC**
- `e15741d` (2025-10-09): **Added Readme file**
- `4933fd6` (2025-10-14): **Added Sample and Updated README**

Because most implementation landed in one commit, some "Broke/Fixed" items are inferred from defensive code patterns rather than explicit bug-fix commits.

## Built

### 1) End-to-end voice call POC (`1be57fd`, 2025-10-09)

- Bootstrapped Node/Express service with webhook handling and WebSocket transport (`server.js`).
- Implemented Twilio ConversationRelay TwiML endpoint at `/voice` and WS endpoint at `/ws`.
- Added conversation state machine:
  - `greet -> ask-intent -> ask-price -> ask-timing -> ask-condition -> transfer`
  - early exits for non-owner, do-not-call, callback-later scenarios.
- Added lead persistence to CSV (`leads.csv`) with timestamp/call metadata.
- Added transfer flow via Twilio call update to `/transfer`.
- Added simple dashboard (`/dashboard`, `public/dashboard.html`) to read/display leads.
- Added scripted prompt + keyword intent modules in `flows/prompts.js`.
- Added tests for prompts and keyword matching in `test/prompts.test.js`.
- Added dependency and project scaffolding (`package.json`, `package-lock.json`, `.gitignore`).

### 2) Documentation pass (`e15741d`, 2025-10-09)

- Added initial README with setup, architecture, call flow testing, and project structure.

### 3) Demo/readiness pass (`4933fd6`, 2025-10-14)

- Added 3 sample call recordings under `samples/`.
- Upgraded README narrative and feature framing for portfolio/demo use.
- Expanded "next steps" to include security, scale, and CRM integration direction.

## Broke (or likely pain points)

These are the issues you likely ran into while building/integrating, inferred from robust guards and fallback logic:

- ConversationRelay message parsing instability (malformed JSON or unexpected frames).
- Missing/late session identifiers (`callSid`) causing orphan prompts.
- Provider/voice configuration mismatches across Twilio/Amazon/Google/ElevenLabs.
- WebSocket protocol negotiation mismatch during upgrade.
- Transfer edge cases where Twilio call update can fail.
- Unbounded call durations and unclear intent after long interactions.
- CSV/dashboard fragility if file shape is unexpected.

## Fixed (or preemptively hardened)

Implemented safeguards that address the above:

- Added JSON parse safety and ignore-on-failure behavior for WS messages.
- Added explicit checks for missing `callSid` and missing session in prompt handling.
- Added provider whitelist and provider-specific voice validation/fallback.
- Added WS upgrade path filtering (`/ws`) and protocol selection preference.
- Added keepalive ping interval and close/error handlers to reduce stale sockets.
- Added hard call cap (`CALL_TIME_LIMIT_SECS`) and intent deadline prompt (`INTENT_DEADLINE_SECS`).
- Wrapped transfer call update in `try/catch` and logged failures.
- Logged end states with structured notes (`DNC`, `NotOwner`, `CallLater`, `Transferred`, timeout).

## Learned

### Product and architecture

- A practical voice agent needs both conversation quality and operations logging.
- Stateful call flows can be simple and effective with a deterministic stage machine.
- CSV + lightweight dashboard is enough for early proof-of-value loops.

### Reliability and integration

- Real-time voice systems benefit from defensive parsing and explicit session keys.
- Provider abstraction needs validation gates to avoid runtime failures from bad voice config.
- Timeouts and guardrails are required to keep calls bounded and predictable.

### Engineering process

- Tests around prompts/keywords protect core intent routing from silent regressions.
- Documentation quality materially improves demo readiness and project credibility.
- "Show, not tell" matters: adding sample call recordings turned the repo into an evidence-backed showcase.

## Timeline (Quick View)

1. `2025-10-09` - Built core POC and tests (`1be57fd`)
2. `2025-10-09` - Added foundational documentation (`e15741d`)
3. `2025-10-14` - Added demo samples and refined narrative (`4933fd6`)

## Open Gaps (already identified by you)

- Validate Twilio webhook signatures before processing requests.
- Put authentication in front of `/dashboard` and possibly `/api/leads`.
- Replace in-memory sessions with Redis/DynamoDB for multi-instance operation.
- Add CRM handoff integration for qualified leads.
