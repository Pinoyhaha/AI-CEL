# AI-CEL

A simple mobile-friendly AI chat frontend for Vercel with the Hugging Face token kept server-side.

## Environment variables

Configure these in Vercel Project Settings → Environment Variables:

- `HF_TOKEN` — your Hugging Face access token
- `HF_MODEL` — optional model ID; defaults to `HuggingFaceH4/zephyr-7b-beta`

Never put the real token in `index.html`, `app.js`, or GitHub.

## Deploy

Import this repository into Vercel and add the environment variables before deploying.
