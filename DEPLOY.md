# Deployment Guide — Midwest Psych Fest 2026

## Overview

The site is a static site (pure HTML/CSS/JS) hosted on **GitHub Pages** via
**GitHub Actions**. Every push to `main` triggers an automatic deploy.

**Live URL:** https://bunjumun.github.io/MidwestPsychFest/

---

## How Deploys Work

1. You push a commit to the `main` branch
2. GitHub Actions runs `.github/workflows/deploy.yml`
3. The workflow uploads the entire repo root as a Pages artifact
4. GitHub Pages serves it at the live URL

Deploy time is typically **1–3 minutes**. Check the status at:
- **GitHub Actions tab** → https://github.com/bunjumun/MidwestPsychFest/actions
- **Admin dashboard** → `admin.html` shows the latest run status badge

---

## Making Changes

### Option A — Edit files locally, commit, and push

```bash
cd /Users/bunj/claude/festwebsite

# Edit files...

git add assets/js/schedule.js   # add specific files
git commit -m "Update schedule data"
git push
```

### Option B — Use the admin dashboard

1. Open `admin.html` in your browser (local server or GitHub Pages URL)
2. Make changes (schedule edits, stage names, etc.)
3. Export the relevant JSON files (schedule.json, stages.json, etc.)
4. Replace the files in `data/` on disk
5. Commit and push

---

## First-Time Setup (if starting from scratch)

```bash
# 1. Initialize repo
cd /Users/bunj/claude/festwebsite
git init
git add .
git commit -m "Initial commit — Midwest Psych Fest 2026 website"

# 2. Create repo on github.com/new
#    Name: MidwestPsychFest
#    Visibility: Public

# 3. Add remote and push
git remote add origin https://github.com/bunjumun/MidwestPsychFest.git
git branch -M main
git push -u origin main

# 4. Enable GitHub Pages
#    Repo → Settings → Pages
#    Source: GitHub Actions
#    Save
```

---

## Data Files

| File | What it controls | How to update |
|------|-----------------|--------------|
| `data/schedule.json` | Public schedule | Export from admin.html or band tool |
| `data/stages.json` | Stage display names | Export from admin.html stage editor |
| `data/markers.json` | Map markers | Export from map admin (map.html?admin=1) |
| `data/info.json` | Festival name, dates, location, tickets URL | Edit directly |

---

## localStorage Notes

The admin tools use `localStorage` as a working scratchpad:
- Changes are **local to your browser** — not committed to the repo
- To publish changes: **Export** the JSON → replace the file in `data/` → commit + push
- The band emails tool (`mpf_schedule_tool.html`) syncs to `mpf_schedule` localStorage,
  which the public schedule page reads in real-time (same browser/tab session only)

---

## Repo Structure

```
festwebsite/
├── index.html          # Home page
├── schedule.html       # Public schedule
├── map.html            # Interactive venue map
├── admin.html          # Admin dashboard (password-gated)
├── flash.html          # Batch data import tool
├── setup.html          # Festival setup wizard
├── mpf_schedule_tool.html  # Band emails / schedule management tool
├── assets/
│   ├── css/            # Stylesheets
│   └── js/             # JavaScript
├── data/               # JSON data files (source of truth for public)
├── .github/workflows/  # GitHub Actions deploy pipeline
└── .gitignore
```
