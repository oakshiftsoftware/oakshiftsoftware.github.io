# Oakshift WebEditor: Multi-Site JSON Publishing Framework
## Developer Onboarding & Deployment Guide

**Version:** 1.0  
**Last Updated:** 2026-07-25  
**Target Audience:** Oakshift Software developers deploying site-specific WebEditor instances for clients

---

## Overview

The **Oakshift WebEditor** is a production-ready, browser-based JSON editor framework designed for static sites driven by GitHub-hosted data files. It authenticates users with GitHub OAuth, locks editing access to a specific repository, and provides three distinct editing modes: Drag & Drop tree manipulation, CRM-style record management, and raw JSON text editing.

**Key selling points:**
- No backend required—runs entirely client-side
- Multi-site ready—one `webeditor.html` file, configured per deployment
- Structured editing for non-technical content teams
- Optional real-time push notifications via Cloudflare Workers
- Tight repository integration—acts as a constrained publishing gateway

---

## Part 1: Core Deployment (Minimum Setup)

The WebEditor *requires* GitHub OAuth and repository configuration. Push notifications are *optional*.

### 1.1 Prerequisites

- A GitHub repository with JSON file(s) to edit
- A GitHub OAuth App (or reuse an existing one)
- An OAuth broker Worker running at a known endpoint (for token exchange)
- Node.js 18+ and npm installed locally (for Worker setup if you want notifications)

### 1.2 Copy the Editor into Your Client Repo

1. Download or clone the `webeditor.html` file from the Oakshift template repository
2. Place it in the root of your client's repository
   ```bash
   cp /path/to/template/webeditor.html /path/to/client-repo/webeditor.html
   ```
3. Commit and push this file to the client repo

### 1.3 Configure the Editor for the Client

Edit the `WEBEDITOR_CONFIG` block near the top of `webeditor.html` (around line 1269):

#### Branding

```javascript
const WEBEDITOR_CONFIG = {
    branding: {
        appTitle: "Client Name WebEditor",           // Shown in page title and header
        tagline: "Manage Client site content",       // Subtitle
        homeTitle: "Welcome to Client Editor",       // Home page heading
        homeIntro: "Edit and publish content...",    // Home page intro text
        aboutTitle: "About",                         // About page heading
        aboutIntro: "This tool manages..."           // About page intro text
    },
    // ... rest of config below
};
```

#### OAuth (use existing Oakshift OAuth App)

```javascript
oauth: {
    clientId: "Ov23liJxZCIXpxYWlATm",              // Oakshift's shared OAuth Client ID
    scope: "repo read:user",                        // Read repos & user profile
    brokerBaseUrl: "https://ghwe.oakshiftsoftware.workers.dev"  // Token exchange Worker
}
```

> **Note:** The OAuth app is registered with a single Client ID shared across all client deployments. The broker Worker is responsible for routing token requests safely. If you need a dedicated OAuth app for a client, register one in their GitHub organization and update both `clientId` and `brokerBaseUrl`.

#### Repository Lock

```javascript
repository: {
    // Set to owner/repo format
    targetRepoFullName: "myclient/myclient-site-repo",
    
    // Define JSON files editable via this tool
    files: {
        posts: "blog/data/posts.json",
        authors: "blog/data/authors.json",
        config: "site/config.json"
    },
    
    // Which file loads by default
    defaultFileKey: "posts"
}
```

#### Session

```javascript
session: {
    ttlSeconds: 8 * 60 * 60  // Session lifetime (8 hours)
}
```

#### Notifications (Optional)

Leave notifications `enabled: false` if the client doesn't need push notifications:

```javascript
notifications: {
    enabled: false,  // ← Set to false to skip Worker setup entirely
    notifyEndpoint: "https://example-worker.workers.dev/notify",
    authToken: "unused-if-disabled",
    siteId: "unused-if-disabled",
    delayMs: 0
}
```

If you *do* enable notifications (see Part 2 below), configure these:

```javascript
notifications: {
    enabled: true,
    notifyEndpoint: "https://client-push-worker.your-account.workers.dev/notify",
    authToken: "< generated in Part 2.9 >",
    siteId: "client-short-id",       // e.g., "acme-corp"
    delayMs: 45000                   // Wait 45 seconds after commit before notifying
}
```

### 1.4 Verify Core Editor Works

1. Push your updated `webeditor.html` to the client repo
2. Open it in a browser: `https://myclient.github.io/webeditor.html` (or your host's URL)
3. Click **Login with GitHub**
4. Authenticate and confirm:
   - ✓ You see the repository name in Stage 2
   - ✓ You can load configured JSON files in Stage 3
   - ✓ Editor modes (Drag & Drop, CRM, Text) respond

**Done!** The core editor is live. Stop here if notifications aren't needed.

---

## Part 2: Optional Push Notifications Setup

Push notifications allow subscribers on the client site to receive live updates when content changes. This requires a Cloudflare Worker to manage subscriptions and deliver notifications.

### 2.1 Scaffold a Cloudflare Worker

Run this from your machine:

```bash
npm create cloudflare@latest client-push-worker
```

When prompted:
- **What type of application?** → Hello World (or the default option)
- **Framework?** → None / skip
- **Language?** → JavaScript
- **Git?** → Yes
- **Deploy now?** → No (we'll deploy later)

Navigate into the project:

```bash
cd client-push-worker
npm install web-push
```

### 2.2 Create KV Namespaces

Namespaces store subscription data and push state:

```bash
npx wrangler kv namespace create SUBSCRIPTIONS
npx wrangler kv namespace create STATE
```

Wrangler will offer to add bindings to `wrangler.toml`. Accept this.

### 2.3 Verify wrangler.toml Configuration

Open `wrangler.toml` and ensure it includes:

```toml
name = "client-push-worker"
main = "src/index.js"
compatibility_date = "2025-01-15"

kv_namespaces = [
  { binding = "SUBSCRIPTIONS", id = "your-namespace-id-here", preview_id = "..." },
  { binding = "STATE", id = "your-other-namespace-id", preview_id = "..." }
]

[env.production]
vars = { ALLOWED_ORIGIN = "https://myclient.github.io" }
```

Replace `ALLOWED_ORIGIN` with your client's actual site domain.

### 2.4 Implement the Worker Handler

Replace the contents of `src/index.js` with the push-notification handler:

```javascript
import webpush from 'web-push';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '';

    // CORS
    const setCorsHeaders = (response) => {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return response;
    };

    if (request.method === 'OPTIONS') {
      return setCorsHeaders(new Response(null, { status: 204 }));
    }

    // GET /health
    if (pathname === '/health') {
      return setCorsHeaders(new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // GET /vapid-public-key
    if (pathname === '/vapid-public-key') {
      const key = env.VAPID_PUBLIC_KEY || '';
      return setCorsHeaders(new Response(JSON.stringify({ publicKey: key }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // POST /subscribe
    if (pathname === '/subscribe' && request.method === 'POST') {
      const subscription = await request.json();
      const subKey = `sub:${Date.now()}:${Math.random()}`;
      await env.SUBSCRIPTIONS.put(subKey, JSON.stringify(subscription), { expirationTtl: 2592000 }); // 30 days
      return setCorsHeaders(new Response(JSON.stringify({ id: subKey }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // POST /unsubscribe
    if (pathname === '/unsubscribe' && request.method === 'POST') {
      const { id } = await request.json();
      await env.SUBSCRIPTIONS.delete(id);
      return setCorsHeaders(new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // POST /notify (requires auth token)
    if (pathname === '/notify' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const expectedToken = env.NOTIFY_BEARER_TOKEN || '';
      if (!authHeader.includes(expectedToken)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

      const payload = await request.json();
      const { title, body, icon, tag, url } = payload;

      webpush.setVapidDetails(
        env.VAPID_SUBJECT,
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY
      );

      const list = await env.SUBSCRIPTIONS.list();
      let successCount = 0;
      let errorCount = 0;

      for (const item of list.keys) {
        const subJson = await env.SUBSCRIPTIONS.get(item.name);
        if (!subJson) continue;

        const subscription = JSON.parse(subJson);
        try {
          await webpush.sendNotification(subscription, JSON.stringify({
            title: title || 'Content Update',
            body: body || 'New content is available.',
            icon: icon || '/icon.png',
            tag: tag || 'update',
            data: { url: url || '/' }
          }));
          successCount++;
        } catch (err) {
          errorCount++;
          if (err.statusCode === 410) {
            await env.SUBSCRIPTIONS.delete(item.name);
          }
        }
      }

      return setCorsHeaders(new Response(JSON.stringify({
        sent: successCount,
        failed: errorCount
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // GET /subscriptions (admin endpoint, auth required)
    if (pathname === '/subscriptions' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization') || '';
      const expectedToken = env.NOTIFY_BEARER_TOKEN || '';
      if (!authHeader.includes(expectedToken)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }

      const list = await env.SUBSCRIPTIONS.list();
      return setCorsHeaders(new Response(JSON.stringify({ count: list.keys.length }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    return new Response('Not Found', { status: 404 });
  }
};
```

### 2.5 Generate VAPID Keys

VAPID keys are used for signing push messages. Generate them:

```bash
node -e "const webpush = require('web-push'); const keys = webpush.generateVAPIDKeys(); console.log('Public:', keys.publicKey); console.log('Private:', keys.privateKey);"
```

Save both keys—you'll need them next.

### 2.6 Set Worker Secrets

Store sensitive values that Wrangler will inject at runtime:

```bash
# Paste the public key you generated above
npx wrangler secret put VAPID_PUBLIC_KEY

# Paste the private key
npx wrangler secret put VAPID_PRIVATE_KEY

# A mailto: address (e.g., mailto:admin@example.com)
npx wrangler secret put VAPID_SUBJECT

# Generate a strong auth token for the /notify endpoint:
# node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npx wrangler secret put NOTIFY_BEARER_TOKEN
```

### 2.7 Deploy the Worker

```bash
npx wrangler deploy
```

Wrangler prints your Worker's public URL, e.g.:
```
✓ Deployed to https://client-push-worker.your-account.workers.dev
```

Save this URL.

### 2.8 Update WebEditor Configuration

Back in your `webeditor.html`, update the notifications section:

```javascript
notifications: {
    enabled: true,
    notifyEndpoint: "https://client-push-worker.your-account.workers.dev/notify",
    authToken: "< the token you set above in step 2.6 >",
    siteId: "client-short-id",
    delayMs: 45000
}
```

### 2.9 Add Service Worker to Client Site

The client site needs a service worker to receive push notifications. Add this file to the root of the client's static site:

**`sw.js`** (Service Worker):

```javascript
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'Update', body: 'Content updated' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon.png',
      badge: '/badge.png',
      tag: data.tag || 'notification',
      data: data.data || {}
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
```

### 2.10 Add Subscription UI to Client Site

On the client's main site, add subscription and unsubscription logic. Example in **`main.js`**:

```javascript
const NOTIFY_WORKER_URL = "https://client-push-worker.your-account.workers.dev";

async function subscribeToNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const vapidResponse = await fetch(`${NOTIFY_WORKER_URL}/vapid-public-key`);
    const { publicKey } = await vapidResponse.json();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch(`${NOTIFY_WORKER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    console.log('Subscribed to notifications');
  } catch (err) {
    console.error('Subscription failed:', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
}

// Call on page load or via a user gesture
subscribeToNotifications();
```

### 2.11 Test End-to-End

1. Open the client's site in a browser
2. Grant notification permission when prompted
3. Open the WebEditor and load a JSON file
4. Edit a value and commit
5. Check browser notifications—you should see one after the configured delay (default 45 seconds)

---

## Part 3: Troubleshooting & Notes

### Authentication Issues

- **"OAuth broker is not configured":** Check that `brokerBaseUrl` in `WEBEDITOR_CONFIG.oauth` is correct and accessible
- **"Session expired":** The session TTL may be too short; increase `session.ttlSeconds` if needed
- **"You must authenticate first":** This is expected before login; navigate to the Editor page

### File Loading Issues

- **"No repository files configured":** Verify `repository.files` has at least one key/path entry
- **"File content could not be resolved":** Ensure the file path is correct and the repo contains it

### Notification Issues

- **Worker returns 401 Unauthorized:** Verify `authToken` in config matches the `NOTIFY_BEARER_TOKEN` secret
- **Subscriptions not saved:** Check KV namespace bindings in `wrangler.toml`
- **Notifications don't arrive:** Ensure service worker is registered and subscription is stored

### Security Considerations

1. **OAuth Token:** Stored in browser session storage; expires with the session
2. **Notify Token:** Currently hardcoded in client config—**rotate this token regularly** and consider moving the notify trigger to a GitHub Action or backend service
3. **Repository Access:** Locked to one repo; users can't access other repos via this editor
4. **Content Review:** Always require human review before publishing via Git workflow

---

## Part 4: Configuration Reference

Complete `WEBEDITOR_CONFIG` template:

```javascript
const WEBEDITOR_CONFIG = {
    branding: {
        appTitle: string,         // Page title and header
        tagline: string,          // Subtitle in header
        homeTitle: string,        // Home page h2
        homeIntro: string,        // Home page intro paragraph
        aboutTitle: string,       // About page h2
        aboutIntro: string        // About page intro paragraph
    },
    oauth: {
        clientId: string,         // GitHub OAuth App Client ID
        scope: string,            // Space-separated scopes (default: "repo read:user")
        brokerBaseUrl: string     // Token broker Worker base URL
    },
    session: {
        ttlSeconds: number        // How long before auto-logout (default: 8 hrs)
    },
    repository: {
        targetRepoFullName: string,    // owner/repo format
        files: {
            [key: string]: string      // Maps display name to file path
        },
        defaultFileKey: string         // Which file loads by default
    },
    notifications: {
        enabled: boolean,              // Skip Worker setup if false
        notifyEndpoint: string,        // Worker /notify URL
        authToken: string,             // Bearer token for /notify
        siteId: string,                // Site identifier
        delayMs: number                // Delay before notify call (ms)
    }
};
```

---

## Part 5: Deployment Checklist

- [ ] Copy `webeditor.html` to client repo root
- [ ] Update `WEBEDITOR_CONFIG.branding` with client name/messaging
- [ ] Set `repository.targetRepoFullName` to `owner/repo`
- [ ] Populate `repository.files` with JSON targets
- [ ] Set `repository.defaultFileKey`
- [ ] Commit and push `webeditor.html`
- [ ] Test core editor (login → file load → edit → commit)
- [ ] **[Optional]** If notifications wanted:
  - [ ] Run `npm create cloudflare`
  - [ ] Create KV namespaces
  - [ ] Generate VAPID keys
  - [ ] Add Worker implementation
  - [ ] Set secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, NOTIFY_BEARER_TOKEN)
  - [ ] Deploy Worker (`npx wrangler deploy`)
  - [ ] Update `WEBEDITOR_CONFIG.notifications` with Worker URL and token
  - [ ] Add service worker (`sw.js`) to client site
  - [ ] Add subscription UI to client site (`main.js`)
  - [ ] Test end-to-end notification flow

---

## Part 6: Support & Future Enhancements

**Known Limitations:**
- Only one JSON file can be edited per commit (by design—keeps commits focused)
- CRM mode requires either an array or object at root; schema detection is automatic but can be customized via `metadata.fields`
- OAuth token is browser-side; for highly sensitive workflows, consider adding TOTP or additional approval gates

**Potential Future Enhancements:**
- Multi-file commit support (edit several files, commit as one change)
- Scheduled/queued commits (draft mode with publish scheduling)
- Audit log integration (GitHub Actions to log all edits)
- Import/export utilities for bulk data operations

---

**Questions?** Refer to the WebEditor built-in **About** page (accessed via the browser UI) for user-facing documentation.

---

*Oakshift Software — Site-specific Web Editor Framework v1.0*
