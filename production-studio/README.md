# My Jersey Production Studio

Production Studio occupies `/production-studio/` inside My Jersey Ecosystem. It displays the supplied stadium design, the real Input, Production and Export states, and owner-scoped jobs. The Cloudflare Worker uses `/api/studio/` for the UI contract.

The Workflow generates two 1,408 × 1,984 artwork images, locks the masters and obtains the vector reconstruction and Ghostscript proof using OpenAI Hosted Shell. The Worker audits each returned EPS, checks the 10 MB limit and publishes the previews, separate EPS files and Master ZIP only after successful preflight.

## Connect production

Use the original `My_Jersey_Studio_Setup.zip` and the Cloudflare account for `myjerseyecosystem`. Create a D1 database named `my-jersey-jobs` and a private R2 bucket for job artifacts. Configure Cloudflare Access for the Studio API under the ecosystem hostname and use the Access team's domain and application audience.

From the root of the ecosystem repository:

```bash
python3 scripts/prepare-production-studio.py My_Jersey_Studio_Setup.zip \
  --database-id YOUR_D1_ID --bucket YOUR_R2_BUCKET \
  --access-team-domain YOUR_TEAM.cloudflareaccess.com --access-aud YOUR_ACCESS_AUDIENCE
npm --prefix production-studio ci
npm --prefix production-studio run build
node scripts/build-cloudflare.mjs
npx wrangler d1 migrations apply DB --config wrangler.studio.jsonc --remote
npx wrangler secret put STUDIO_ARTWORK_PROMPT --config wrangler.studio.jsonc < production-studio/.runtime/approved-prompt.gz.b64
npx wrangler secret put OPENAI_API_KEY --config wrangler.studio.jsonc
npx wrangler deploy --config wrangler.studio.jsonc
```

The preparation command verifies the approved runtime and packages the original prompt for the Worker secret. Keep the generated runtime folder and account configuration out of Git. Future live deploys should use the account-connected configuration and the same approved runtime assets.

The job needs access to OpenAI Images, Responses and Hosted Shell. Its Standard and Fast settings request the corresponding processing tier. Each output report records measured vector geometry and print preflight. Direct Illustrator import and printer-specific approval are separate checks.
