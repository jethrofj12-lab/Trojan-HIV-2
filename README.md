# HIV Memory T‑cell Game (Simple Visual)

A tiny React + Vite + Tailwind app that shows how HIV can hide in memory T‑cells (latent reservoir), why ART suppresses spread but doesn't remove those cells, and why introducing a new pathogen can cause a viral "blip".

## Quick start (local)

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. **Create a new repo** on GitHub (e.g., `hiv-memory-game`) and push this project to it.
2. In `vite.config.js`, set:
   ```js
   base: '/REPO_NAME/'
   ```
   Replace `REPO_NAME` with your repo name (e.g., `/hiv-memory-game/`).
3. Commit and push.
4. In GitHub: **Settings → Pages**: ensure "Build and deployment" is set to **GitHub Actions**.
5. The provided workflow at `.github/workflows/deploy.yml` will build and publish. Wait for it to run on `main`.
6. Your site will appear at: `https://<your-username>.github.io/REPO_NAME/`

## Embed in WordPress

Add a **Custom HTML** block with:
```html
<div style="max-width:720px;margin:auto">
  <iframe src="https://<your-username>.github.io/REPO_NAME/" width="720" height="520" style="border:0;border-radius:16px;overflow:hidden" loading="lazy"></iframe>
</div>
```

Or package this into a tiny plugin with a shortcode; ping me if you want that ZIP.

---

**Note:** Educational demo only; not a simulator or medical advice.
