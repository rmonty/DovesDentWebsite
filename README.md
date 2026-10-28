# DovesDent Website

Marketing website for DovesDent paintless dent repair services.

## Pages
- Home (`index.html`)
- Services (`services.html`)
- FAQ (`faq.html`)
- Contact (`contact.html`)

## Structure
- `css/` - site styles
- `js/` - client-side scripts
- `images/` - image assets

## Local Preview
Open `index.html` in a browser, or serve the folder with any static file server.

## Contact Form Delivery (Cloudflare Pages Free Tier)
This project includes a Pages Function at `functions/api/contact.js`.

### Required Cloudflare environment variable
- `CONTACT_EMAIL`: your destination inbox (for example your Gmail address)

### Optional environment variable
- `FROM_EMAIL`: sender address (default: `no-reply@doveshailandcollisionrepair.com`); the domain must be onboarded to Cloudflare Email Sending
- `RATE_LIMIT_SECONDS`: seconds to throttle repeat submissions from same IP (default: `30`)

### How it works
- `index.html` and `contact.html` post to `/api/contact`.
- The function saves each submission to KV, then emails `CONTACT_EMAIL` through Cloudflare Email Service. Pages Functions cannot hold a `send_email` binding, so the send happens in the private `dovesdent-mailer` Worker (`mailer-worker/`, deploy with `npx wrangler deploy` from that folder), reached through the `MAILER` service binding on the Pages project.
- A honeypot field silently drops bot submissions.
- Simple IP throttling reduces duplicate spam bursts.

### Cloudflare setup steps
1. In Pages project settings, add `CONTACT_EMAIL` (and optionally `FROM_EMAIL`) under Environment Variables.
2. Deploy the latest commit.
3. Submit a test form on the live site and confirm it arrives in Gmail (and check Spam once).

## Admin Dashboard (No-Code Content Updates)

This repo now includes an owner dashboard at `admin.html`.

What it does:
- Google sign-in for owner access.
- Firestore-backed content storage.
- Public pages (`index.html`, `services.html`, `faq.html`, `contact.html`) read content from Firestore and apply updates without code edits.

### Files added
- `admin.html`
- `css/admin.css`
- `js/admin.js`
- `js/site-content.js`
- `js/firebase-config.js`

### Firebase setup
1. Create a Firebase project.
2. Enable Authentication -> Sign-in method -> Google.
3. Create a Firestore database (production mode recommended).
4. Open `js/firebase-config.js` and replace all `REPLACE_ME` values.
5. In `js/firebase-config.js`, set `ADMIN_EMAILS` to the owner Google account(s).
6. Deploy the site.

### Recommended Firestore security rules

```txt
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /site/content {
			allow read: if true;
			allow write: if request.auth != null
				&& request.auth.token.email in ["owner@example.com"];
		}
	}
}
```

Replace `owner@example.com` with your real owner login(s).

### Cloudflare Auth vs Firebase Auth

- Cloudflare can protect routes (for example with Cloudflare Access / Zero Trust) and is excellent as an edge gate.
- You still need an authenticated identity + data-layer permissions for in-browser content editing.
- For this implementation, Firebase Auth + Firestore is the most direct option because it handles both login and document-level write access in one stack.
- Optional hardening: keep Firebase Auth as primary app auth, and also put `admin.html` behind Cloudflare Access.

## Photo Uploads for Estimates

Customers can optionally attach up to 8 photos to an inspection request. Photos
are compressed in the browser, stored privately in **Cloudflare R2**, and linked
from the owner email and the admin dashboard. Images are served only through
signed, expiring links.

### Files added
- `functions/api/upload.js` — accepts and validates a single photo, stores it in R2
- `functions/api/image.js` — serves a photo given a valid signed link
- `functions/api/submissions.js` — admin-only list of recent requests
- `js/main.js` — photo selection, compression, upload, and form submission
- `css/upload.css` — upload UI styles
- `SETUP.md` — required R2 bucket, KV namespace, bindings, and environment variables

### Quick start
1. Create an R2 bucket and a KV namespace in Cloudflare.
2. Bind them to the Pages project as `UPLOADS` and `SUBMISSIONS`.
3. Add the environment variables listed in [SETUP.md](SETUP.md), including the
   `IMAGE_SIGNING_KEY` secret, `FIREBASE_PROJECT_ID`, and `ADMIN_EMAILS`.
4. Deploy and submit a test request with a photo.

See [SETUP.md](SETUP.md) for full instructions and troubleshooting.

