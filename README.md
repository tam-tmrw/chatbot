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
