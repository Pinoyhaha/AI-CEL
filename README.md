# AI-CEL

AI-CEL is a mobile-friendly AI chat frontend for Vercel with the Hugging Face token kept server-side.

## Current AI

- Provider: Hugging Face Inference Providers → Featherless AI
- Model: `UnfilteredAI/DAN-L3-R1-8B`
- Modes: Unfiltered Chat and Coding AI
- API endpoint: `/api/chat`

## Environment variables

Configure this in Vercel Project Settings → Environment Variables:

- `HF_TOKEN` — your Hugging Face access token

Never put the real token in `index.html`, `app.js`, or GitHub.

## Deploy

Import this repository into Vercel and add `HF_TOKEN` before deploying. Vercel will automatically serve the static frontend and the `api/chat.js` serverless function.
