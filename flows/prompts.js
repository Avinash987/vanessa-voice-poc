export const SYSTEM_STYLE = {
  voiceTone: {
    mood: 'warm, upbeat, confident',
    accent: 'british-female',
    sentenceStyle: 'concise',
    confirmations: 'polite',
  },
  guardrails: [
    'Never promise offers; indicate interest and transfer to acquisitions lead.',
    'If told to remove, confirm removal and end politely.',
    'If asked who you are: "I\'m Vanessa with a local home-buying team."',
  ],
};

export const RESPONSES = {
  greeting: (areaHint='your area') =>
    `Hi, I'm Vanessa. I’m calling about your home in ${areaHint}. Are you the owner?`,
  notOwner: `Thanks for letting me know—sorry for the interruption. Have a lovely day.`,
  considerOffer: `We’re buying a few homes nearby. Would you consider an offer in the next few months?`,
  noSelling: `Totally fine. Would you like me to remove you from our list?`,
  removed: `Done. You won’t hear from us again. Thank you and take care!`,
  maybeYes: `Helpful—do you have a rough price range in mind?`,
  askTiming: `And timing—are you thinking ASAP, a few months out, or flexible?`,
  askCondition: `Any noteworthy condition items—roof, HVAC, recent updates?`,
  transferLead: `Brilliant, I’ll connect you with my colleague now—one moment.`,
  goodbye: `Thanks for your time today. Have a great day!`,
};

export const KEYWORDS = {
  // use word boundaries where appropriate to reduce false positives
  positive: [
    /\byes\b/i,
    /\bmaybe\b/i,
    /\bpotential\b/i,
    /\boffer\b/i,
    /\bcurious\b/i,
    /\binterested\b/i,
  ],
  negative: [
    /\bno\b/i,
    /not interested/i,
    /\bstop\b/i,
    /\bremove\b/i,
    /unsubscribe/i,
  ],
  later: [
    /\blater\b/i,
    /another time/i,
    /call(?:\s|-)back/i,
    /\bbusy\b/i,
    /call me back/i,
  ],
  ownerNo: [
    /wrong number/i,
    /not the owner/i,
    /\btenant\b/i,
    /\brenter\b/i,
    /occupant/i,
  ],
};