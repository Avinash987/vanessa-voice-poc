# Vanessa Voice POC

Vanessa is a proof-of-concept voice acquisitions agent that answers inbound calls, qualifies sellers, and either transfers hot leads or logs the outcome for review. The project uses **Twilio ConversationRelay** for real-time audio, **Express** for webhooks, and a **WebSocket** to drive the conversation loop.

---

## How It Works

- **/voice webhook** – Twilio hits this endpoint when a call arrives. We respond with TwiML `<ConversationRelay>` so the call connects to our WebSocket and streams audio both ways. ElevenLabs voices are the default TTS provider; you can switch voices by setting env vars or passing `?voice=bella` (or other configured names).
- **WebSocket Conversation** – `server.js` hosts a WebSocket server at `/ws`. ConversationRelay pipes caller speech to us as JSON frames (`prompt` events). We score intent, emit scripted responses with `sendText`, and persist the call’s state in memory.
- **Session Flow** – The script moves through greeting → intent → price → timing → condition → transfer. Negative or non-owner responses end politely; “do-not-call” requests are logged and terminated immediately.
- **Lead Logging** – Every call writes to `leads.csv` with intent, notes, and timestamps. The lightweight dashboard (`/dashboard`) reads that CSV to display captured leads.

---

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set environment variables** – copy `.env.example` if you have one (or create `.env`) and fill in values:
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
   Console logs will show `HTTP on :8080` once Express boots.

4. **Expose the server (optional)** – use Cloudflare Tunnel or ngrok:
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
   Update your Twilio phone number’s “A Call Comes In” webhook to `https://<your-tunnel>/voice`.

---

## Testing the Call Flow

1. **Warm up** – Hit `https://<tunnel>/voice` in a browser; you should get TwiML `<ConversationRelay .../>`.
2. **Place a call** – Call your Twilio number from a verified phone. Listen for:
   - Twilio trial banner (for trial accounts)
   - Vanessa greeting: “Hi, I’m Vanessa… Are you the owner?”
   - Stage logs in the console (`stage=ask-intent intent=MaybeYes prompt="Maybe. Sure."`)
3. **Branch scenarios**
   - Say “Yes, I’m the owner” → flow proceeds through price, timing, condition, and announces transfer.
   - Say “No, not interested” → she offers to remove you and exits politely.
   - Say “Call me later” → she schedules a callback.
   - Say “I rent here” → immediate polite goodbye.
   - Stay silent twice → she apologizes and ends the call.
4. **Dashboard** – Visit `https://<tunnel>/dashboard` to see the CSV-backed lead list.

---

## Voice Options

- Default ElevenLabs voice is used when no voice ID is provided.
- To test a specific voice in real time, append `?voice=bella` (or `matilda`, `rachel`) to `/voice`.
- `elevenlabsTextNormalization` is enabled by default for better pronunciation. Toggle with `?elevenlabsTextNormalization=off`.

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
├─ .env                 # Environment variables (not checked in)
└─ package.json
```

---

## Notes & Next Steps

- **Transfers** – When Vanessa reaches the `transfer` stage, the server updates the call with `/transfer` TwiML, handing off to an acquisitions lead.
- **Scaling** – Replace the in-memory session map with Redis or another store if you need multi-instance resilience.
- **Security** – For production, validate Twilio signatures on webhooks and secure the dashboard behind auth.

Enjoy the build — feel free to expand Vanessa’s script or plug in custom ElevenLabs voices by adding env keys like `ELEVEN_VOICE_ID_MYVOICE`.
