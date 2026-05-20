# Slack bot setup for DHiBob notifications

DHiBob can DM users in Slack for "big" events (new time-off request, final approval, final rejection). The DM goes to whichever Slack account has the same email as the employee's Develeap email. If an employee isn't on the Slack workspace, the DM is silently skipped.

Setup takes ~5 minutes:

## 1. Create a Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it **DHiBob Notifications** and pick your Develeap Slack workspace.

## 2. Add OAuth scopes

In the app config sidebar: **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**:

- `chat:write` — post DMs
- `users:read` — required for lookup
- `users:read.email` — map Develeap emails to Slack user IDs
- `im:write` — open DM channels

## 3. Install to workspace

Still on **OAuth & Permissions** → **Install to Workspace** → authorise.

Copy the **Bot User OAuth Token** (starts with `xoxb-`).

## 4. Set env vars

Add to your `.env` (or Docker secrets):

```
SLACK_BOT_TOKEN=xoxb-...
NEXT_PUBLIC_APP_URL=https://dhibob.develeap.com
```

`NEXT_PUBLIC_APP_URL` is the link target rendered as "View in DHiBob" in each DM.

## 5. Restart the app

```
docker compose up -d --build
```

## Verifying

1. Submit a time-off request as an employee whose Develeap email matches their Slack email.
2. The direct manager, skip-level manager, and every HR/Admin user should receive a DM from the **DHiBob Notifications** bot.
3. If nothing arrives, check the server logs for `[notify] slack send failed` messages.

## Opting out

By default every user gets both email and Slack. Users can opt out per channel by setting `notifyEmail: false` or `notifySlack: false` on their `Employee.personalInfo` JSON. (The profile-page toggle UI is pending.)

## Scope reference

| Scope | Why we need it |
|---|---|
| `chat:write` | Post the DM |
| `users:read` | Required by `users.lookupByEmail` |
| `users:read.email` | Map Develeap email → Slack user ID |
| `im:write` | Open DM channel with the user |
