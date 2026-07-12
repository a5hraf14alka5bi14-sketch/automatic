# SEO Strategy

## In scope
- Public deployment root (`/`) which serves the app shell and login experience before authentication
- Bot-accessible static assets and metadata for the public shell (`index.html`, `public/manifest.webmanifest`, favicon/app icons)
- Crawl-governance files (`robots.txt`, `sitemap.xml`, `llms.txt`) if present or clearly needed for the public shell

## Out of scope
- Authenticated dashboard and staff routes (`/dashboard`, `/pos`, `/orders`, `/kitchen`, `/menu`, `/inventory`, `/recipes`, `/customers`, `/reports`, `/settings`, `/integrations`, `/notion`, `/ai-executive`, `/system`, `/suppliers`, `/profile`, `/change-password`)
- API endpoints except where they affect crawlability of the public shell

## Target audience
- Restaurant staff accessing the deployed app
- Potential branded visitors landing on the deployment root

## Primary keywords
- Unknown — likely branded queries around Automatic Restaurant OS / الأوتوماتيك اللبناني

## Current posture notes
- The application is a client-rendered Vite SPA with no SSR or prerendering.
- The public surface is currently limited to the root/login shell; deeper app routes are authenticated product surfaces, not landing pages.
- For this login-only public surface, metadata quality and indexing control matter more than standalone sitemap or `llms.txt` coverage.

## Dismissed categories
- (None yet)
