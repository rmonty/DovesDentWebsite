# Photo Uploads for Estimates — Setup

This adds optional photo uploads to the inspection request form. Customers can
attach up to 8 photos; the owner sees them in the email notification and in the
`admin.html` dashboard.

## How it works

1. On `contact.html`, the browser downscales each photo (max 2000px, JPEG) and
   uploads it to `POST /api/upload`.
2. `functions/api/upload.js` validates the bytes (JPEG/PNG/WebP/HEIC), enforces
   size and rate limits, and stores the file in a private R2 bucket under
   `estimates/<date>/<uuid>.<ext>`.
3. The form submits the collected object keys to `POST /api/contact`, which
   re-validates them, stores the request in KV, and emails the owner with
   signed, expiring photo links.
4. `GET /api/image` serves a photo only with a valid signed link.
5. `GET /api/submissions` powers the owner dashboard. It requires a Firebase ID
   token from an allow-listed admin account.

Photos are private. The R2 bucket is never public; links expire and are signed
with `IMAGE_SIGNING_KEY`.

> **Why not presigned direct-to-R2 uploads?** The R2 Workers binding does not
> expose a `createPresignedUrl` method. Presigning would require storing R2 S3
> API credentials, implementing SigV4, and configuring bucket CORS. Uploading
> one photo per request through the Function is simpler and keeps every request
> small (photos are compressed client-side to well under the request limit).
> If traffic ever grows, this can be revisited.

## 1. Create the R2 bucket

In the Cloudflare dashboard: **R2 → Create bucket**.

- Name it something like `dovesdent-estimate-photos`.
- Leave it **private** (do not enable public access / r2.dev).
- Retention: a lifecycle rule (`delete-estimate-photos-60d`) deletes objects
  under prefix `estimates/` after 60 days (**R2 → bucket → Settings → Object
  lifecycle rules**). The KV submissions expire on their own via TTL; set
  `SUBMISSION_TTL_SECONDS` to `5184000` (60 days) to match, otherwise requests
  outlive their photos.

## 2. Create the KV namespace

**Workers & Pages → KV → Create namespace**, named like
`dovesdent-submissions`.

## 3. Bind them to the Pages project

**Pages project → Settings → Functions → Bindings** (labelled *Bindings* under
*Settings* in some dashboard versions):

| Binding name | Type        | Target                          |
| ------------ | ----------- | ------------------------------- |
| `UPLOADS`    | R2 bucket   | `dovesdent-estimate-photos`     |
| `SUBMISSIONS`| KV namespace| `dovesdent-submissions`         |

Add the same bindings for the **Production** and **Preview** environments.

## 4. Environment variables

**Pages project → Settings → Environment variables.** Add these for Production
(and Preview if you test there):

| Variable                  | Type   | Required | Default | Purpose |
| ------------------------- | ------ | -------- | ------- | ------- |
| `CONTACT_EMAIL`           | text   | yes      | —       | Where requests are emailed |
| `FROM_EMAIL`              | text   | no       | `no-reply@dovesdent.com` | MailChannels sender |
| `RATE_LIMIT_SECONDS`      | text   | no       | `30`    | Contact-form throttle |
| `UPLOAD_MAX_FILES`        | text   | no       | `8`     | Max photos per submission |
| `UPLOAD_MAX_BYTES`        | text   | no       | `8388608` (8 MB) | Max size per stored photo |
| `SUBMISSION_TTL_SECONDS`  | text   | no       | `7776000` (90 days) | How long requests stay in KV |
| `IMAGE_LINK_TTL_SECONDS`  | text   | no       | `2592000` (30 days) | Photo link lifetime |
| `FIREBASE_PROJECT_ID`     | text   | yes*     | —       | `dovesdent-website-20260531` |
| `ADMIN_EMAILS`            | text   | yes*     | —       | Comma-separated owner emails allowed to view requests |
| `IMAGE_SIGNING_KEY`       | secret | yes      | —       | Random key used to sign photo links |

\* Required for the admin dashboard (`/api/submissions`). Without them the
dashboard shows "not configured", but form submission and email still work.

Generate `IMAGE_SIGNING_KEY` with a secure random value, for example:

```
openssl rand -hex 32
```

`ADMIN_EMAILS` must match the owner accounts in `js/firebase-config.js`, e.g.
`rmonty98@gmail.com,dovehailrepair@gmail.com`.

## 5. Deploy

Commit and deploy the Pages project as usual (Git integration or direct upload).
No build step is required; `functions/` is compiled automatically.

## 6. Test

1. Open `contact.html`, fill the form, add a photo, submit.
2. Confirm the email arrives with a "Photos" link.
3. Open the link — the image should display. After 30 days it returns 403.
4. Sign in at `admin.html` and confirm the request card shows with thumbnails.
5. Try uploading a non-image or a >8 MB file — it should be rejected.

## Notes and limits

- Client-side compression reduces most phone photos to a few hundred KB.
  HEIC files that the browser cannot decode are uploaded as-is; very large HEIC
  files may be rejected with a clear message.
- Rate limiting is per IP per minute (uploads) and per IP per 30 seconds
  (contact form), using Cloudflare's Cache API.
- Photos may include license plates or addresses. Keep the bucket private, use
  a retention rule, and mention photo use in the form consent text (already
  added).
