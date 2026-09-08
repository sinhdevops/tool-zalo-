# My Documents history integration

The sidebar uses the signed-in account's `loginInfo.send2me_id`. This is a separate destination, not the account UID and not a Windows directory.

The SDK's WebSocket `requestOldMessages` (510/511) is a general recent-history stream and did not return this account's saved My Documents messages. Zalo Web has a separate cloud reader:

- `getCM` in the inspected public Zalo Web bundle calls GET `/api/cm/getrecentv2` or `/api/cm/getoldv2` on the `group_cloud_message` service.
- Parameters include `groupId`, `globalMsgId`, `count`, `msgIds`, `imei`, `isOA: 1` for send2me, and `src`.
- Response data has `groupMsgs`, `lastMsgId`, `isOld`, and `hasMore`.
- Source inspected locally: `node_modules/.tmp/zalo-sync-research/1.7a40934bc92f49b7036d.js`, `static getCM`, `_getApiFunc`, `_callApiCloud`; version 690 in `default-embed-render.df671d644cb7c6844627.js`.

`server/messages/documents-history.ts` implements this read-only request using the authenticated SDK transport. It preserves large numeric IDs, scopes messages to the authenticated send2me destination, and maintains separate pagination from ordinary chats. Opening My Documents triggers one initial request; explicit load-more/retry is scoped to the same destination. Errors do not mark history as exhausted.

## Current live limitation (2026-09-03)

Both recent and old cloud requests to the login-provided service returned error 604, `Lỗi không xác định`. SDK version 665 and the inspected web version 690 produced the same error; source LOADMORE=3 also returned 604. A read-only check against the public bundle's default cloud host timed out. No saved messages were returned, sent, or deleted by these checks. Temporary diagnostic script removed.

The integration is not verified as working end-to-end. The UI reports failure to load saved messages, rather than implying the Zalo cloud is empty. A working authenticated Zalo Web request/response is still needed to identify the missing protocol requirement. Do not claim that old My Documents history has been imported until actual messages are returned.
