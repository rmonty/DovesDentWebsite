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
- `FROM_EMAIL`: sender address used by MailChannels (default: `no-reply@dovesdent.com`)
- `RATE_LIMIT_SECONDS`: seconds to throttle repeat submissions from same IP (default: `30`)

### How it works
- `index.html` and `contact.html` post to `/api/contact`.
- The function forwards submissions through MailChannels from Cloudflare and sends to `CONTACT_EMAIL`.
- A honeypot field silently drops bot submissions.
- Simple IP throttling reduces duplicate spam bursts.

### Cloudflare setup steps
1. In Pages project settings, add `CONTACT_EMAIL` (and optionally `FROM_EMAIL`) under Environment Variables.
2. Deploy the latest commit.
3. Submit a test form on the live site and confirm it arrives in Gmail (and check Spam once).
