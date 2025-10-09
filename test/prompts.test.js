import assert from 'assert';
import { describe, it } from 'node:test';
import { RESPONSES, KEYWORDS, SYSTEM_STYLE } from '../flows/prompts.js';

describe('prompts module', () => {
  it('RESPONSES.greeting should interpolate area', () => {
    const out = RESPONSES.greeting('Bristol');
    assert.ok(out.includes('Bristol'));
    assert.match(out, /Are you the owner\?/);
  });

  it('SYSTEM_STYLE.voiceTone should be structured', () => {
    assert.strictEqual(typeof SYSTEM_STYLE.voiceTone, 'object');
    assert.ok(SYSTEM_STYLE.voiceTone.mood);
  });

  it('KEYWORDS should match representative phrases', () => {
    const samples = {
      positive: ['Yes', 'Maybe later', 'I might be curious about an offer', 'I am interested'],
      negative: ['No thanks', 'Please remove me', 'Stop calling', 'unsubscribe me'],
      later: ['Call me later', 'Busy right now', 'Can you call back?', 'another time'],
      ownerNo: ['Wrong number', 'I am a tenant', 'Not the owner', 'occupant'],
    };

    for (const cat of Object.keys(samples)) {
      const regs = KEYWORDS[cat];
      assert.ok(Array.isArray(regs), `KEYWORDS.${cat} should be an array`);
      for (const s of samples[cat]) {
        const matched = regs.some(r => r.test(s));
        assert.ok(matched, `${cat} should match "${s}"`);
      }
    }
  });
});
