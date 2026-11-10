# VI Chatbot

Virtual influencer chatbot built with Next.js 15.

## Prerequisites

- Node.js 20+
- MySQL 8

## Setup

1. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Run tests:

   ```bash
   npm test
   ```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Admin leads (demo)

Set `ADMIN_SECRET` in `.env.local`. Open [http://localhost:3000/admin/leads](http://localhost:3000/admin/leads) — the page prompts once for the secret and stores it in `sessionStorage` (`vi_admin_secret`). API routes require header `x-admin-secret`. This is a demo gate, not production IAM.

## ManyChat (Facebook Page)

1. Deploy over HTTPS. Set `MANYCHAT_CALLBACK_SECRET` and `PUBLIC_BASE_URL`.
2. In ManyChat Default Reply, add a Dynamic Block POST to `{PUBLIC_BASE_URL}/api/manychat/callback` with header `x-manychat-secret`.
3. Body JSON: `{ "id": "{{user_id}}", "last_input_text": "{{last_input_text}}" }`.
4. Set a ManyChat fallback message if the request fails.
5. Web chat at `/` is unchanged.

Details: `docs/manychat-gateway-design.md`.

## Huggies pitch

Open `/huggies`. Set `HUGGIES_ACCESS_CODE` and `HYUNDAI_ACCESS_CODE` (6 characters each). Set `HUGGIES_VIDEO_URLS` to a comma-separated list of S3 video URLs, plus `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` for photo checks. Hyundai chat behavior is unchanged aside from the access code on `/`.
