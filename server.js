import 'dotenv/config';
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import dayjs from 'dayjs';
import { createObjectCsvWriter as csvWriter } from 'csv-writer';
import twilio from 'twilio';
import { RESPONSES, KEYWORDS } from './flows/prompts.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const {
  PORT = 8080,
  HOST,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  ACQUISITION_LEAD_NUMBER,
  VOICE_PROVIDER: VOICE_PROVIDER_ENV,
  VOICE_ID: VOICE_ID_ENV,
  VOICE_LANGUAGE: VOICE_LANGUAGE_ENV,
  CALL_TIME_LIMIT_SECS = 180,
  INTENT_DEADLINE_SECS = 90,
} = process.env;

const DEFAULT_TTS_PROVIDER = '';
const DEFAULT_VOICE_ID = '';
const DEFAULT_LANGUAGE = 'en-GB';

const KNOWN_TWILIO_VOICES = new Set([
  'en-US-JennyNeural',
  'en-US-NancyNeural',
  'en-US-SaraNeural',
  'en-US-AvaNeural',
  'en-US-AmberNeural',
  'en-GB-SoniaNeural',
  'en-GB-AmeliaNeural',
  'en-GB-LibbyNeural',
]);

const VOICE_PROVIDER = (VOICE_PROVIDER_ENV || DEFAULT_TTS_PROVIDER).trim();
const VOICE_ID = (VOICE_ID_ENV || DEFAULT_VOICE_ID).trim();
const VOICE_LANGUAGE = (VOICE_LANGUAGE_ENV || DEFAULT_LANGUAGE).trim();

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// in memory session store
const sessions = new Map();

// CSV logger
const leadCsv = csvWriter({
  path: 'leads.csv',
  header: [
    { id: 'timestamp', title: 'timestamp' },
    { id: 'callSid', title: 'callSid' },
    { id: 'from', title: 'from' },
    { id: 'to', title: 'to' },
    { id: 'intent', title: 'intent' },
    { id: 'price', title: 'price' },
    { id: 'timing', title: 'timing' },
    { id: 'condition', title: 'condition' },
    { id: 'notes', title: 'notes' },
  ],
  append: true,
});

// Utilities
function wsUrl() {
  const baseHost = HOST || `http://localhost:${PORT}`;
  const url = new URL(baseHost);
  url.protocol = url.protocol.replace('http', 'ws');
  url.pathname = '/ws';
  return url.toString();
}

function now() { return dayjs().format('YYYY-MM-DD HH:mm:ss'); }

function scoreIntent(text) {
  if (!text) return 'Unknown';
  if (KEYWORDS.ownerNo.some(r => r.test(text))) return 'NotOwner';
  if (KEYWORDS.negative.some(r => r.test(text))) return 'No';
  if (KEYWORDS.later.some(r => r.test(text))) return 'Later';
  if (KEYWORDS.positive.some(r => r.test(text))) {
    // If the match is exactly "yes" or simple confirmation, return MaybeYes directly
    const trimmed = text.trim().toLowerCase();
    if (/^yes$/.test(trimmed)) return 'MaybeYes';
    return 'MaybeYes';
  }
  return 'Unknown';
}

function sendText(ws, message, last = true, opts = {}) {
  const payload = {
    type: 'text',
    token: message,
    last: !!last,
  };
  if (opts.lang) payload.lang = opts.lang;
  if (opts.interruptible !== undefined) payload.interruptible = !!opts.interruptible;
  if (opts.preemptible !== undefined) payload.preemptible = !!opts.preemptible;
  const json = JSON.stringify(payload);
  console.log(`[${now()}] → ${json}`);
  ws.send(json);
}

async function streamSay(ws, full, chunkSize = 40, opts = {}) {
  const parts = full.match(new RegExp(`.{1,${chunkSize}}(?:\\s|$)`, 'g')) || [full];
  for (let i = 0; i < parts.length; i += 1) {
    const chunk = parts[i].trim();
    if (!chunk) continue;
    const isLast = i === parts.length - 1;
    sendText(ws, chunk, isLast, opts);
    await new Promise(r => setTimeout(r, 10));
  }
}

// Basic logging and cors for Twilio webhook callbacks
app.use((req, res, next) => {
  console.log(`[${now()}] ${req.method} ${req.originalUrl}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function voiceHandler(req, res) {
  const callSid = (req.body && req.body.CallSid) || req.query.CallSid;
  if (callSid) {
    console.log(`[${now()}] Responding to /voice for CallSid=${callSid}`);
  } else {
    console.log(`[${now()}] Responding to /voice without CallSid (likely initial fetch)`);
  }

  const queryProvider = (req.query.ttsProvider ? String(req.query.ttsProvider) : '').trim();
  const queryVoice = (req.query.voice ? String(req.query.voice) : '').trim();
  const queryLanguage = (req.query.language ? String(req.query.language) : '').trim();

  const allowedProviders = new Set(['twilio', 'amazon', 'google', 'elevenlabs']);
  let providerKey = (queryProvider || VOICE_PROVIDER || DEFAULT_TTS_PROVIDER || '').trim().toLowerCase();
  if (providerKey && !allowedProviders.has(providerKey)) {
    console.warn(`[${now()}] Unsupported ttsProvider "${providerKey}", removing override`);
    providerKey = '';
  }

  let voice = (queryVoice || VOICE_ID || DEFAULT_VOICE_ID).trim();
  let language = (queryLanguage || VOICE_LANGUAGE || DEFAULT_LANGUAGE).trim();

  let providerAttr = '';
  if (providerKey) {
    providerAttr = ({
      'twilio': 'Twilio',
      'amazon': 'Amazon',
      'google': 'Google',
      'elevenlabs': 'ElevenLabs',
    }[providerKey] || '');

    if (providerKey === 'twilio' && voice && !KNOWN_TWILIO_VOICES.has(voice)) {
      console.warn(`[${now()}] Twilio voice "${voice}" not recognized; removing override to use default`);
      voice = '';
      providerAttr = '';
    }
    if (providerKey === 'amazon' && voice && !/^Polly\./i.test(voice)) {
      console.warn(`[${now()}] Amazon voice "${voice}" invalid; removing override`);
      voice = '';
      providerAttr = '';
    }
  }

  const providerLabel = providerAttr || 'Default';
  const voiceLabel = providerAttr ? (voice || '(default)') : '(auto)';
  console.log(`[${now()}] Using ttsProvider=${providerLabel}, voice=${voiceLabel}, language=${language || '(default)'}`);

  const attrs = [
    `url="${wsUrl()}"`,
    language ? `language="${language}"` : null,
    providerAttr ? `ttsProvider="${providerAttr}"` : null,
    providerAttr && voice ? `voice="${voice}"` : null,
  ].filter(Boolean);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay ${attrs.join(' ')}/>
  </Connect>
</Response>`;
  res.type('text/xml').send(twiml);
}

// TwiML entrypoint
app.get('/voice', voiceHandler);
app.post('/voice', voiceHandler);

// Transfer TwiML target (called via Call Update)
app.post('/transfer', (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now.</Say>
  <Dial callerId="${TWILIO_PHONE_NUMBER}">${ACQUISITION_LEAD_NUMBER}</Dial>
</Response>`;
  res.type('text/xml').send(twiml);
});

// Simple dashboard
app.get('/api/leads', async (_req, res) => {
  // naive: read CSV into memory
  const fs = await import('fs');
  const data = fs.readFileSync('leads.csv', 'utf-8').trim().split('\n');
  const [header, ...rows] = data;
  const keys = header.split(',');
  const json = rows.map(r => Object.fromEntries(r.split(',').map((v,i)=>[keys[i], v])));
  res.json(json);
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(process.cwd() + '/public/dashboard.html');
});

const server = http.createServer(app);
server.listen(PORT, () => console.log(`HTTP on :${PORT}`));

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => {
    const offered = [...protocols].map(p => p.trim()).filter(Boolean);
    if (!offered.length) return undefined;
    const twilioPreferred = offered.find(p => p.toLowerCase().includes('twilio'));
    return (twilioPreferred || offered[0]);
  },
});

server.on('upgrade', (request, socket, head) => {
  const { url, headers } = request;
  const host = headers.host || 'localhost';
  const pathname = new URL(url, `http://${host}`).pathname;
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const protocols = headers['sec-websocket-protocol'] || '';
  console.log(`[${now()}] WS upgrade request for ${pathname} (protocols: ${protocols || 'none'})`);
  wss.handleUpgrade(request, socket, head, (ws) => {
    console.log(`[${now()}] WS upgrade accepted (protocol: ${ws.protocol || 'none'})`);
    wss.emit('connection', ws, request);
  });
});

// WebSocket for ConversationRelay
wss.on('connection', (ws, request) => {
  const callSidHeader = request.headers['x-twilio-call-sid'];
  if (callSidHeader) {
    console.log(`[${now()}] ConversationRelay connected (CallSid=${callSidHeader})`);
  } else {
    console.log(`[${now()}] ConversationRelay connected (no CallSid header)`);
  }

  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 15000);

  ws.on('close', (code, reason) => {
    clearInterval(pingInterval);
    const detail = reason && reason.length ? ` reason=${reason.toString()}` : '';
    console.log(`[${now()}] ConversationRelay closed (code=${code})${detail}`);
    if (ws.callSid) sessions.delete(ws.callSid);
  });

  ws.on('error', (err) => {
    clearInterval(pingInterval);
    console.error(`[${now()}] ConversationRelay error`, err);
  });

  ws.on('message', async (raw) => {
    const rawText = raw.toString();
    console.log(`[${now()}] raw message: ${rawText}`);
    let msg;
    try {
      msg = JSON.parse(rawText);
    } catch (err) {
      console.error(`[${now()}] Failed to parse ConversationRelay message`, err);
      return;
    }
    if (msg.type === 'setup') {
      const { callSid, from, to } = msg;
      ws.callSid = callSid;
      sessions.set(callSid, {
        callSid, from, to,
        startedAt: Date.now(),
        stage: 'greet',
        price: '', timing: '', condition: '', intent: 'Unknown',
        lastSpoken: '',
      });
      console.log(`[${now()}] setup received for CallSid=${callSid} from=${from} to=${to}`);
      sendText(ws, RESPONSES.greeting(), true, { interruptible: true, lang: VOICE_LANGUAGE });
      return;
    }

    if (msg.type === 'prompt') {
      const callSid = msg.callSid || ws.callSid;
      const { voicePrompt } = msg;
      if (!callSid) {
        console.warn(`[${now()}] Prompt received without callSid; ignoring`);
        return;
      }
      const s = sessions.get(callSid);
      if (!s) {
        console.warn(`[${now()}] No session found for callSid=${callSid}; ignoring prompt`);
        return;
      }

      const elapsed = (Date.now() - s.startedAt) / 1000;
      const intent = scoreIntent(voicePrompt);
      if (intent !== 'Unknown') s.intent = intent;

      let reply = '';
      console.log(`[${now()}] stage=${s.stage} intent=${intent} prompt="${voicePrompt}"`);

      // Hard time cap (unless transferring)
      if (elapsed > Number(CALL_TIME_LIMIT_SECS)) {
        reply = RESPONSES.goodbye;
        sendText(ws, reply, true, { lang: VOICE_LANGUAGE });
        await leadCsv.writeRecords([{ timestamp: now(), callSid: s.callSid, from: s.from, to: s.to, intent: s.intent, price: s.price, timing: s.timing, condition: s.condition, notes: 'Auto end: time cap' }]);
        ws.close();
        return;
      }

      switch (s.stage) {
        case 'greet': {
          if (intent === 'NotOwner') {
            reply = RESPONSES.notOwner;
            s.stage = 'end';
            s.intent = 'NotOwner';
          } else {
            reply = RESPONSES.considerOffer;
            s.stage = 'ask-intent';
          }
          break;
        }
        case 'ask-intent': {
          if (intent === 'No') {
            reply = RESPONSES.noSelling;
            s.stage = 'offer-remove';
          } else if (intent === 'Later') {
            reply = 'No problem. When’s a better time—later today or another day this week?';
            s.stage = 'schedule';
          } else {
            reply = RESPONSES.maybeYes;
            s.stage = 'ask-price';
          }
          break;
        }
        case 'offer-remove': {
          if (/yes|remove|stop/i.test(voicePrompt)) {
            reply = RESPONSES.removed;
            s.stage = 'end';
            s.intent = 'DNC';
          } else {
            reply = RESPONSES.goodbye;
            s.stage = 'end';
          }
          break;
        }
        case 'schedule': {
          reply = 'Got it. I’ll note that down and we’ll ring back then. Thanks so much!';
          s.stage = 'end';
          s.intent = 'CallLater';
          break;
        }
        case 'ask-price': {
          s.price = voicePrompt;
          reply = RESPONSES.askTiming;
          s.stage = 'ask-timing';
          break;
        }
        case 'ask-timing': {
          s.timing = voicePrompt;
          reply = RESPONSES.askCondition;
          s.stage = 'ask-condition';
          break;
        }
        case 'ask-condition': {
          s.condition = voicePrompt;
          reply = RESPONSES.transferLead;
          s.stage = 'transfer';
          break;
        }
        case 'transfer': {
          // Trigger transfer: redirect call to /transfer TwiML
          try {
            await twilioClient.calls(callSid).update({ url: `${HOST}/transfer`, method: 'POST' });
            await leadCsv.writeRecords([{ timestamp: now(), callSid: s.callSid, from: s.from, to: s.to, intent: 'Qualified', price: s.price, timing: s.timing, condition: s.condition, notes: 'Transferred' }]);
          } catch (e) {
            console.error('Transfer failed', e.message);
          }
          return; // No more text; handoff in progress
        }
        case 'end': default: {
          reply = RESPONSES.goodbye;
          const notes = s.intent === 'DNC'
            ? 'DNC confirmed'
            : s.intent === 'NotOwner'
              ? 'Not owner'
              : 'Ended';
          await leadCsv.writeRecords([{ timestamp: now(), callSid: s.callSid, from: s.from, to: s.to, intent: s.intent, price: s.price, timing: s.timing, condition: s.condition, notes }]);
          sendText(ws, reply, true, { lang: VOICE_LANGUAGE });
          ws.close();
          return;
        }
      }

      // 90s intent deadline enforcement
      if (elapsed > Number(INTENT_DEADLINE_SECS) && ['ask-intent','ask-price'].includes(s.stage)) {
        reply = 'Before I let you go—are you open to an offer on the property at all?';
        s.stage = 'ask-intent';
      }

      if (!reply) {
        console.warn(`[${now()}] No reply generated for stage=${s.stage}; skipping send`);
        return;
      }

      if (s.stage === 'end') {
        const notes = s.intent === 'DNC'
          ? 'DNC confirmed'
          : s.intent === 'NotOwner'
            ? 'Not owner'
            : 'Ended';
        await leadCsv.writeRecords([{ timestamp: now(), callSid: s.callSid, from: s.from, to: s.to, intent: s.intent, price: s.price, timing: s.timing, condition: s.condition, notes }]);
        sendText(ws, reply, true, { lang: VOICE_LANGUAGE });
        ws.close();
        return;
      }

      sendText(ws, reply, true, { interruptible: true, lang: VOICE_LANGUAGE });
      s.lastSpoken = reply;
    }
  });
});
