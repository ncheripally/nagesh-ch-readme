/**
 * Cloudflare Worker — Groq API Proxy
 * Deploy to: nageshch.com/api/chat
 *
 * Set environment variable via CLI:
 *   wrangler secret put GROQ_API_KEY
 */

const ALLOWED_ORIGIN = 'https://nageshch.com';
const MAX_TOKENS = 300;
const RATE_LIMIT_REQUESTS = 10;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

const ipStore = new Map();

function getRateLimit(ip) {
  const now = Date.now();
  const record = ipStore.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW;
  }
  return record;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    // Rate limit by IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateRecord = getRateLimit(ip);
    if (rateRecord.count >= RATE_LIMIT_REQUESTS) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }
    rateRecord.count++;
    ipStore.set(ip, rateRecord);

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    const { messages } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400 });
    }
    if (messages.length > 10) {
      return new Response(JSON.stringify({ error: 'Session limit exceeded' }), { status: 400 });
    }

    // Call Groq API (OpenAI-compatible format)
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
      }),
    });

    const data = await groqResponse.json();

    // Normalize to match what frontend expects
    const normalized = {
      content: [{
        type: 'text',
        text: data.choices?.[0]?.message?.content || 'Sorry, something went wrong.'
      }]
    };

    return new Response(JSON.stringify(normalized), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      },
    });
  },
};
