// KI-Prüfer (optional): Claude liest den fertigen Trade-Plan aller 11 Helfer und gibt eine kurze Zweitmeinung + OK/VETO.
// Aktiv nur mit ANTHROPIC_API_KEY und dem Schalter „KI-Prüfer“ in den Einstellungen. Das SDK ist eine optionale Abhängigkeit:
// fehlt es, läuft der Bot ganz normal ohne KI-Prüfer weiter.
'use strict';
let Anthropic = null; try { const m = require('@anthropic-ai/sdk'); Anthropic = m.default || m; } catch (_) {}
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
let client = null;
const available = () => !!(Anthropic && (process.env.ANTHROPIC_API_KEY || '').trim());
const SYSTEM = `Du bist der KI-Prüfer eines regelbasierten Trading-Bots (Paper-Konto, keine Anlageberatung).
Elf Helfer haben einen Trade vorbereitet und alle harten Risiko-Regeln sind bereits bestanden. Deine Aufgabe ist eine nüchterne Zweitmeinung:
Suche Widersprüche zwischen den Helfern (z. B. Setup gegen höheren Zeitrahmen, Erwartungswert knapp, Hindernis nah am Ziel, negative Nachrichtenlage, wenig Historie).
Gib VETO nur bei einem konkreten, benennbaren Problem – nicht aus allgemeiner Vorsicht. Antworte auf Deutsch, knapp (max. 2 Sätze Begründung).`;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['verdict', 'reason', 'confidence'],
  properties: { verdict: { type: 'string', enum: ['OK', 'VETO'] }, reason: { type: 'string' }, confidence: { type: 'integer', minimum: 0, maximum: 100 } } };
async function review(brief) {
  if (!available()) return { s: 'idle', t: 'KI-Prüfer aus (kein ANTHROPIC_API_KEY)', verdict: null };
  client = client || new Anthropic({ timeout: 90e3, maxRetries: 2 });
  try {
    const r = await client.beta.messages.create({
      model: MODEL, max_tokens: 2000, system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: 'Trade-Plan der Helfer (JSON):\n' + JSON.stringify(brief) }],
    });
    if (r.stop_reason === 'refusal') return { s: 'idle', t: 'KI-Prüfer hat abgelehnt zu bewerten – Regeln entscheiden', verdict: null };
    const txt = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const j = JSON.parse(txt); return { s: j.verdict === 'VETO' ? 'veto' : 'done', t: `${j.verdict}: ${String(j.reason).slice(0, 220)}`, verdict: j.verdict, confidence: j.confidence, model: r.model };
  } catch (e) {
    const why = Anthropic && e instanceof Anthropic.RateLimitError ? 'Rate-Limit' : Anthropic && e instanceof Anthropic.AuthenticationError ? 'API-Key ungültig' : Anthropic && e instanceof Anthropic.APIError ? 'API-Fehler ' + e.status : 'nicht erreichbar';
    return { s: 'error', t: `KI-Prüfer ${why} – Regeln entscheiden allein`, verdict: null };
  }
}
module.exports = { review, available, MODEL };
