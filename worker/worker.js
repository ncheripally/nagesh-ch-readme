/**
 * Cloudflare Worker — Groq API Proxy
 * Route: nageshch.com/api/chat
 * Secret: GROQ_API_KEY
 */

const MAX_TOKENS = 300;
const RATE_LIMIT_REQUESTS = 10;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

const ALLOWED_ORIGINS = [
  'https://nageshch.com',
  'https://www.nageshch.com',
];

const ipStore = new Map();

function getRateLimit(ip) {
  const now = Date.now();
  const record = ipStore.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + RATE_LIMIT_WINDOW; }
  return record;
}

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const SYSTEM_PROMPT = `You are an expert AI assistant on the portfolio of Nagesh CH, a Senior Agentic AI Architect & Engineer with 11+ years experience. You specialize in Agentic AI, LLMs, RAG, MLOps, and enterprise AI systems.
RULES:
- Only answer questions about AI, ML, data science, LLMs, agentic systems, or enterprise AI
- Keep answers concise (max 3-4 sentences) — this is a portfolio demo
- If asked non-AI topics, politely redirect to AI topics
- Be insightful, technical but accessible`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateRecord = getRateLimit(ip);
    if (rateRecord.count >= RATE_LIMIT_REQUESTS) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    rateRecord.count++;
    ipStore.set(ip, rateRecord);

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders }); }

    const { messages, temperature, top_p, frequency_penalty, presence_penalty } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0 || messages.length > 10) {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400, headers: corsHeaders });
    }

    // Clamp sampling params to safe ranges
    const temp  = Math.min(Math.max(parseFloat(temperature)        || 0.7,  0.0),  2.0);
    const topp  = Math.min(Math.max(parseFloat(top_p)              || 0.9,  0.01), 1.0);
    const freq  = Math.min(Math.max(parseFloat(frequency_penalty)  || 0.0, -2.0),  2.0);
    const pres  = Math.min(Math.max(parseFloat(presence_penalty)   || 0.0, -2.0),  2.0);

    try {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: MAX_TOKENS,
          temperature: temp,
          top_p: topp,
          frequency_penalty: freq,
          presence_penalty: pres,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        }),
      });

      const data = await groqResponse.json();

      if (!groqResponse.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || 'Groq API error' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const normalized = {
        content: [{ type: 'text', text: data.choices?.[0]?.message?.content || 'No response generated.' }]
      };

      return new Response(JSON.stringify(normalized), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },
};
