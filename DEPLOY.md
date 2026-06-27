# Deploy Groq Proxy — Step by Step

## Steps

### 1. Install Wrangler
```bash
npm install -g wrangler
```

### 2. Login to Cloudflare
```bash
wrangler login
```

### 3. Add Groq API key (secure)
```bash
wrangler secret put GROQ_API_KEY
# Paste your gsk_... key when prompted
```

### 4. Deploy
```bash
wrangler deploy
```

### Done
Proxy live at: https://nageshch.com/api/chat

## Free tier limits (Groq)
- 14,400 requests/day
- 30 requests/minute
- No credit card needed

## Cloudflare free tier
- 100,000 Worker requests/day
