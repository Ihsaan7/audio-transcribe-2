# Deploying to Vercel

This app can be deployed to Vercel as a static frontend (built with Vite) plus
one serverless function (`api/transcribe.ts`) that proxies audio to Groq for
transcription. Vercel is a separate hosting platform from Replit, so you'll
need your own (free) Vercel account.

## 1. Push your code to GitHub

Vercel deploys from a Git repository. If this project isn't on GitHub yet,
use the "git-remote" workflow in Replit (or `git push` manually) to push it
to a GitHub repo first.

## 2. Create the Vercel project

1. Go to https://vercel.com and sign in (or sign up).
2. Click **Add New... → Project**, then **Import** your GitHub repository.
3. On the "Configure Project" screen:
   - **Root Directory**: click "Edit" and set it to `artifacts/urdu-transcriber`.
     This is required because the app lives inside a pnpm monorepo — Vercel
     needs to know which sub-project to build, but it will still find and use
     the workspace's `pnpm-lock.yaml` at the repo root automatically.
   - **Framework Preset**: Vite (should be auto-detected once the Root
     Directory is set).
   - Leave Build/Output/Install commands as-is — they're already configured in
     `artifacts/urdu-transcriber/vercel.json`.

## 3. Set the Groq API key

Still on the "Configure Project" screen (or later under **Project Settings →
Environment Variables**):

1. Add a new environment variable:
   - **Name**: `GROQ_API_KEY`
   - **Value**: your Groq API key (the same kind of key used for this app on
     Replit — get one at https://console.groq.com/keys if you don't have it)
   - **Environments**: Production, Preview, and Development (check all three)
2. Save.

The key is only ever read server-side by `api/transcribe.ts` — it's never
sent to or used by the browser.

## 4. Deploy

Click **Deploy**. Vercel will install dependencies, run `vite build`, and
publish the `api/transcribe.ts` function. The first deploy usually takes a
couple of minutes because it installs the whole monorepo's dependencies.

If you'd rather deploy from the command line instead of the dashboard:

```bash
npm i -g vercel        # one-time install of the Vercel CLI
cd artifacts/urdu-transcriber
vercel login
vercel                 # deploys a preview
vercel --prod          # promotes to production
```

The CLI will ask for the same Root Directory / environment variable
information as the dashboard flow above the first time you run it.

## 5. Smoke test

1. Open the deployed URL Vercel gives you.
2. Upload a short audio file (a minute or two of Urdu speech is a good test).
3. Click "Transcription Shuru Karein" and confirm a transcript appears within
   a few seconds.
4. Check the transcript can be copied and downloaded as `.txt`.

If the request fails immediately with a "Transcription service is not
configured" error, double check `GROQ_API_KEY` is set on the Vercel project
and redeploy (env var changes require a new deployment to take effect).

## Notes and limits

- **Function timeout**: `vercel.json` sets `maxDuration: 60` seconds for the
  transcription function. This comfortably covers Groq's response time for a
  single ~20-minute audio chunk (as encoded by this app, each chunk is well
  under Groq's 25MB limit). Vercel's Hobby plan caps function duration at 60
  seconds; if you're on Hobby and see timeouts on unusually large chunks,
  either upgrade to Pro (up to 300s) or reduce the chunk length in
  `src/lib/audioPipeline.ts`.
- **Upload size**: the function accepts files up to 30MB (larger than any
  single chunk this app produces), matching the limit used by the Replit-hosted
  API route.
- **Local dev**: this Replit workspace's own dev/production setup is
  unaffected by these changes — `pnpm --filter @workspace/urdu-transcriber run dev`
  and the existing Replit artifact deployment continue to work exactly as
  before.
