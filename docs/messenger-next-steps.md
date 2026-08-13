# Messenger integration — next steps

The v1 demo uses web chat only. This stub proves the channel boundary; wiring live Facebook Messenger is a follow-on task.

## Prerequisites

1. **Meta App** — Create an app at [developers.facebook.com](https://developers.facebook.com) with the Messenger product enabled.
2. **Facebook Page** — Link the app to the Page that will receive messages.
3. **Page access token** — Generate a long-lived Page token with `pages_messaging` permission; store as `MESSENGER_PAGE_ACCESS_TOKEN` (not used in v1 stub).
4. **Verify token** — Choose a secret string; set `MESSENGER_VERIFY_TOKEN` in env for webhook subscription.
5. **HTTPS endpoint** — Meta requires a public HTTPS URL (e.g. Vercel, ngrok for local dev).

## Wiring the full flow

```
Meta webhook POST
  → app/api/messenger/webhook/route.ts
  → normalizeMessengerMessage (extend for real entry[].messaging[] shape)
  → handleTurn (ConversationEngine)   ← reuse existing engine, same as POST /api/chat
  → Send API (graph.facebook.com/v21.0/me/messages)
```

**Reuse `ConversationEngine`:** Do not fork conversation logic. Normalize Meta payloads to `IncomingMessage` (`channel: "messenger"`, `channelUserId` = PSID) and call `handleTurn` from `lib/conversation/engine.ts`. Map the returned `OutgoingMessage.text` back via the Send API.

## Stub status (v1)

| Piece | Status |
|-------|--------|
| `normalizeMessengerMessage` | Minimal fake shape only |
| Webhook GET | Returns `hub.challenge` when verify token matches |
| Webhook POST | 501 — Send API not implemented |
| Session / leads | Same MySQL schema (`channel = messenger`) when wired |

## Checklist before go-live

- [ ] Extend `normalizeMessengerMessage` for Meta `entry[].messaging[]` payloads
- [ ] Call `handleTurn` in POST handler; send reply via Send API
- [ ] Subscribe webhook to `messages`, `messaging_postbacks` (if needed)
- [ ] Test verify handshake + inbound message + outbound reply on staging HTTPS
- [ ] Confirm leads appear in admin with `channel = messenger`
