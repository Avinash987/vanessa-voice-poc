# Vanessa Voice POC

Vanessa is a proof-of-concept voice acquisitions agent that answers inbound calls, qualifies sellers, and either transfers hot leads or logs the outcome for follow-up. It pairs **Twilio ConversationRelay** for real-time audio streaming with an **Express** webhook server and a **WebSocket** conversation loop.

---

## Demo Audio

- [Seller qualification call – take 1](samples/Venessa%20test%201.m4a)
- [Seller qualification call – take 2](samples/Venessa%20Test%202.m4a)
- [Seller qualification call – take 3](samples/Vanessa%20test%203.m4a)

Each recording highlights how Vanessa greets the caller, probes intent, collects timeline and condition, and then either escalates or exits gracefully.

---

## Feature Highlights

- Real-time two-way audio via Twilio ConversationRelay and ElevenLabs voices (switch voices with a query string).
- Scripted conversation engine that advances through greeting → intent → price → timing → condition → transfer.
- Automatic lead capture: every call appends to `leads.csv`, and the lightweight `/dashboard` visualizes the pipeline.
- Branching logic for non-owners, do-not-call requests, silence detection, and polite shutdowns.
- Configurable speech synthesis knobs (speed, stability, similarity) and voice IDs per environment.

---

## How the System Fits Together

- **/voice webhook** – Receives inbound calls, responds with TwiML `<ConversationRelay>` so Twilio streams audio over WebSocket.
- **WebSocket conversation loop** – `server.js` listens on `/ws`, ingests caller transcriptions, scores intent, and pushes responses back with `sendText`.
- **Session memory** – Conversation state stays in memory for quick prototyping; swap for Redis when scaling horizontally.
- **Lead logging + dashboard** – Outcomes land in `leads.csv`; the static dashboard at `/dashboard` reads it to show captured leads with timestamps.

---

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment**
   ```bash
   PORT=8080
   HOST=https://<_your_tunnel_>
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
   ACQUISITION_LEAD_NUMBER=+1xxxxxxxxxx
   # ElevenLabs defaults (optional, already safe to leave blank)
   VOICE_PROVIDER=ElevenLabs
   VOICE_LANGUAGE=en-US
   ELEVEN_MODEL=flash_v2_5
   ELEVEN_SPEED=1.0
   ELEVEN_STABILITY=1.0
   ELEVEN_SIMILARITY=1.0
   ELEVEN_VOICE_ID=
   ELEVEN_VOICE_ID_BELLA=EXAVITQu4vr4xnSDxMaL
   ELEVEN_VOICE_ID_MATILDA=TxGEqnHWrfWFTfGW9XjX
   ELEVEN_VOICE_ID_RACHEL=21m00Tcm4TlvDq8ikWAM
   ```
3. **Run the server**
   ```bash
   node server.js
   ```
   You’ll see `HTTP on :8080` when Express is ready.
4. **Expose locally (optional)**
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
   Point your Twilio “A Call Comes In” webhook to `https://<your-tunnel>/voice`.

---

## Test the Call Flow

- Warm up via `https://<tunnel>/voice` and confirm TwiML `<ConversationRelay .../>` renders.
- Call your Twilio number and listen for:
  - Twilio trial banner (if applicable).
  - Vanessa greeting: “Hi, I’m Vanessa… Are you the owner?”
  - Stage logs in the console such as `stage=ask-intent intent=MaybeYes prompt="Maybe. Sure."`
- Explore branches:
  - Owner → proceeds through price, timing, condition, announces transfer.
  - Not interested or renter → exits politely and logs the outcome.
  - Callback request → schedules and confirms before ending.
  - Silence twice → apologizes and ends the call.
- Open `https://<tunnel>/dashboard` to confirm the CSV-backed lead list updates.

---

## Voice Options

- Default ElevenLabs voice plays when no ID is provided.
- Append `?voice=bella`, `?voice=matilda`, `?voice=rachel`, or any configured voice to `/voice` to test alternatives.
- Toggle ElevenLabs text normalization with `?elevenlabsTextNormalization=off`.

---

## Project Structure

```
vanessa-voice-poc/
├─ server.js            # Express + WebSocket server, conversation logic
├─ flows/
│  └─ prompts.js        # Scripted responses and keyword regexes
├─ public/
│  └─ dashboard.html    # Simple CSV-driven lead dashboard
├─ test/
│  └─ prompts.test.js   # Keyword/response unit tests (Node test runner)
├─ leads.csv            # Appended call outcomes
├─ samples/             # Demo call recordings included in this repo
└─ package.json
```

---

## Next Steps

- Harden webhooks with Twilio signature validation and add auth around the dashboard.
- Swap the in-memory session map for Redis or DynamoDB when scaling.
- Layer in CRM integrations to push hot leads automatically to acquisitions reps.

Enjoy the build — and if you want to run with Vanessa, I’m always up for a chat about voice-first automations.
