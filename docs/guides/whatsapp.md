---
title: "Tutorial: WhatsApp"
sidebarTitle: "WhatsApp Setup"
description: "Connect your agent to WhatsApp using QR code (personal) or Cloud API (business)"
---

# Tutorial: WhatsApp

Get started with Milady's WhatsApp integration. This guide covers both connection methods — QR code for personal accounts and Cloud API for business accounts.

<Info>
  This tutorial assumes you have Milady installed. If you haven't already, check out the [Installation Guide](../getting-started/installation.md).
</Info>

## Prerequisites

- A phone with WhatsApp installed
- Milady installed and running (`bun run dev`)
- Access to the Milady dashboard (default: http://localhost:2138)

## Quick Setup — QR Code (Personal)

The fastest way to connect. Uses your personal WhatsApp account — no API keys, no business account, no costs.

<Steps>
  <Step title="Enable WhatsApp">
    1. Open **http://localhost:2138** in your browser
    2. Navigate to **Connectors** in the top navigation
    3. Find **WhatsApp** and toggle it **ON**
    4. Make sure **QR Code (Personal)** is selected at the top
  </Step>

  <Step title="Connect via QR Code">
    1. Click the **Connect WhatsApp** button at the bottom of the settings panel
    2. A QR code will appear in the dashboard
    3. Open WhatsApp on your phone
    4. Go to **Settings** → **Linked Devices** → **Link a Device**
    5. Scan the QR code with your phone camera
    6. Wait for the connection to establish — you'll see a success message
  </Step>

  <Step title="Test It">
    1. Open WhatsApp on another phone or ask someone to message your number
    2. Send a message — the bot should respond
    3. Click **Test Connection** in the dashboard to verify the connection is active
  </Step>
</Steps>

That's it — your bot is live on WhatsApp.

<Warning>
  QR code mode uses an unofficial WhatsApp Web protocol. Use a dedicated phone number — not your primary personal number. WhatsApp may restrict accounts that appear to be automated.
</Warning>

## Quick Setup — Cloud API (Business)

For official business integrations using Meta's WhatsApp Business API.

<Steps>
  <Step title="Create a Meta Developer App">
    1. Go to [developers.facebook.com](https://developers.facebook.com/) and create an account
    2. Create a new App → select **Business** type
    3. Add the **WhatsApp** product to your app
    4. In the WhatsApp section, you'll find your **Access Token** and **Phone Number ID**
  </Step>

  <Step title="Configure in Dashboard">
    1. Open the Milady dashboard → **Connectors** → **WhatsApp**
    2. Select **Cloud API (Business)** at the top
    3. Enter your **Access Token**
    4. Enter your **Phone Number ID**
    5. Optionally set **Webhook Verify Token** (needed if you want to receive messages via webhooks)
    6. Click **Save Settings**
  </Step>

  <Step title="Set Up Webhooks (Required for Receiving Messages)">
    1. In the Meta Developer Dashboard, go to **WhatsApp** → **Configuration**
    2. Set the **Callback URL** to your server's public URL + `/api/whatsapp/webhook`
    3. Set the **Verify Token** to the same value you entered in the dashboard
    4. Subscribe to the **messages** webhook field
  </Step>
</Steps>

## Access Control

### DM Policy

Controls who can message your bot in private chats.

| Policy | Behavior |
|--------|----------|
| **Open** | Anyone can message the bot and get a response |
| **Allowlist** | Only phone numbers in the allowed list get responses |
| **Disabled** | Bot won't respond to any DMs |

When you select **Allowlist**, an input field appears where you enter allowed phone numbers as a JSON array:

```json
["+5511999999999", "+14155551234"]
```

Use the full international format with country code (e.g., `+55` for Brazil, `+1` for US).

### Group Policy

Controls whether the bot responds in group chats.

| Policy | Behavior |
|--------|----------|
| **Open** | Bot responds in any group it's added to |
| **Allowlist** | Only responds in groups on the allowed list |
| **Disabled** | Bot won't respond in any groups |

When you select **Allowlist**, enter allowed group IDs as a JSON array:

```json
["120363001234567890@g.us"]
```

### Finding Group IDs

WhatsApp group IDs look like `120363001234567890@g.us`. To find a group's ID:

1. **From the bot's logs** — When the bot receives a message from a group, the group JID is logged. Send a test message in the group and check the terminal output.
2. **From WhatsApp Web** — Open the group in WhatsApp Web, the URL contains the group ID.
3. **Using the bot** — Send a message in the group asking the bot to identify the chat. The group JID will appear in the agent's conversation logs in the dashboard.

## Configuration via milady.json

You can also configure WhatsApp directly in `~/.milady/milady.json`:

### QR Code Mode

```json
{
  "env": {
    "WHATSAPP_AUTH_DIR": "./auth/whatsapp",
    "WHATSAPP_DM_POLICY": "open",
    "WHATSAPP_GROUP_POLICY": "disabled"
  }
}
```

### Cloud API Mode

```json
{
  "env": {
    "WHATSAPP_ACCESS_TOKEN": "your-access-token",
    "WHATSAPP_PHONE_NUMBER_ID": "your-phone-number-id",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN": "your-verify-token",
    "WHATSAPP_DM_POLICY": "open",
    "WHATSAPP_GROUP_POLICY": "open"
  }
}
```

Or use a `.env` file in your project root:

```bash
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
```

## Configuration Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| **Auth Directory** (`WHATSAPP_AUTH_DIR`) | No | Directory where Baileys stores session files. Defaults to a system path. |
| **Access Token** (`WHATSAPP_ACCESS_TOKEN`) | Cloud API | Access token from Meta Developer Dashboard |
| **Phone Number ID** (`WHATSAPP_PHONE_NUMBER_ID`) | Cloud API | Phone number ID from WhatsApp Business |
| **Webhook Verify Token** (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`) | Cloud API | Token for webhook verification |
| **Business Account ID** (`WHATSAPP_BUSINESS_ACCOUNT_ID`) | No | WhatsApp Business Account ID |
| **API Version** (`WHATSAPP_API_VERSION`) | No | Cloud API version (default: v24.0) |
| **DM Policy** (`WHATSAPP_DM_POLICY`) | No | `open`, `allowlist`, or `disabled` |
| **Group Policy** (`WHATSAPP_GROUP_POLICY`) | No | `open`, `allowlist`, or `disabled` |
| **Allowed Users** (`WHATSAPP_ALLOWED_USERS`) | No | JSON array of allowed phone numbers (when DM Policy is Allowlist) |
| **Allowed Groups** (`WHATSAPP_ALLOWED_GROUPS`) | No | JSON array of allowed group IDs (when Group Policy is Allowlist) |

## Session Persistence

Baileys saves its session state to the `authDir` directory. This includes encryption credentials and device registration info.

**Important:**
- Never commit the auth directory to version control
- Back up the auth directory to avoid re-scanning on a new machine
- The auth directory grants full access to the linked WhatsApp session

The session is reused across restarts — you only need to scan the QR code once.

## Troubleshooting

<AccordionGroup>
  <Accordion title="QR code doesn't appear">
    **Problem:** You click Connect WhatsApp but no QR code shows up.

    **Solutions:**
    1. Make sure the WhatsApp plugin is toggled ON and the agent has restarted
    2. Check the terminal for error messages
    3. Try refreshing the dashboard page
    4. Ensure no other instance is using the same auth directory
  </Accordion>

  <Accordion title="QR code expires before scanning">
    **Problem:** The QR code disappears or shows an error before you can scan it.

    **Solutions:**
    1. QR codes expire after ~20 seconds — a new one is generated automatically
    2. Have your phone ready before clicking Connect WhatsApp
    3. Make sure your phone has internet access while scanning
  </Accordion>

  <Accordion title="Bot doesn't respond to messages">
    **Problem:** WhatsApp is connected but the bot doesn't reply.

    **Solutions:**
    1. Check that the connector shows as ACTIVE (not just enabled)
    2. Verify your DM Policy isn't set to Disabled
    3. If using Allowlist, make sure the sender's number is in the allowed list
    4. Check the terminal logs for errors during message processing
    5. Ensure an AI provider (Anthropic, OpenAI, etc.) is configured and active
  </Accordion>

  <Accordion title="Session expired — need to re-scan">
    **Problem:** Bot was working but stopped, and won't reconnect.

    **Solutions:**
    1. Your phone may have unlinked the device — check Settings → Linked Devices
    2. Delete the auth directory contents and restart Milady
    3. Scan a new QR code
    4. This can happen if your phone loses internet for an extended period
  </Accordion>

  <Accordion title="'NEEDS SETUP' badge won't go away">
    **Problem:** WhatsApp shows "Needs setup" even though you've connected.

    **Solutions:**
    1. No fields are strictly required — the badge should not appear
    2. Try refreshing the page after saving settings
    3. If the badge persists, it may be a display issue — the connector can still work
  </Accordion>

  <Accordion title="Connection drops frequently">
    **Problem:** The bot keeps disconnecting and reconnecting.

    **Solutions:**
    1. Ensure your phone stays connected to the internet
    2. WhatsApp limits the number of linked devices — remove unused ones
    3. Avoid sending messages too rapidly (WhatsApp may throttle)
    4. Check if WhatsApp has pushed an update that requires re-linking
  </Accordion>

  <Accordion title="Cloud API: Webhook not receiving messages">
    **Problem:** You've set up Cloud API but incoming messages aren't received.

    **Solutions:**
    1. Verify your callback URL is publicly accessible (not localhost)
    2. Check that the Verify Token matches in both Meta Dashboard and Milady
    3. Make sure you subscribed to the **messages** webhook field
    4. Test the webhook URL with Meta's built-in test tool
  </Accordion>
</AccordionGroup>

## Next Steps

- **[Connectors Guide](../guides/connectors.md)** — Overview of all available connectors
- **[Telegram Bot Setup](../guides/tutorial-telegram-bot.md)** — Set up Telegram alongside WhatsApp
- **[Configuration Guide](../guides/config-templates.md)** — Advanced configuration options

## Need Help?

- Join the [Milady Community Discord](https://discord.gg/milady)
- Report issues on [GitHub](https://github.com/milady-ai/milady/issues)
