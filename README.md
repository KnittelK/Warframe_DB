# Warframe DB

A static website that serves Warframe game data. Data is updated and committed on a nightly CI/CD run and served via **GitHub Pages**.

## Live Site

Once GitHub Pages is enabled for this repository the site is available at:

```
https://knittelk.github.io/Warframe_DB/
```

## Features

- Browse **Warframes**, **Primary weapons**, **Secondary weapons**, **Melee weapons**, and **Mods**
- Search by name or description
- Filter and sort within each category
- Detailed item view modal
- Data refreshed automatically every night via GitHub Actions

## Repository Structure

```
├── index.html                   # Main static page
├── css/style.css                # Styles
├── js/app.js                    # Front-end logic (fetch + render)
├── data/
│   ├── meta.json                # Metadata (last updated timestamp)
│   ├── warframes.json           # Warframe data
│   ├── primary.json             # Primary weapon data
│   ├── secondary.json           # Secondary weapon data
│   ├── melee.json               # Melee weapon data
│   └── mods.json                # Mod data
├── scripts/
│   └── fetch_data.py            # Data-fetch script (run by CI)
└── .github/workflows/
    ├── update_data.yml          # Nightly data update workflow
    └── deploy_pages.yml         # GitHub Pages deployment workflow
```

## Data Source

Game data is sourced from the community API at [warframestat.us](https://warframestat.us). All game content and data © [Digital Extremes](https://www.warframe.com).

## GitHub Actions

| Workflow | Trigger | Purpose |
|---|---|---|
| `update_data.yml` | Daily at 02:00 UTC | Runs `scripts/fetch_data.py`, commits updated JSON to `data/` |
| `deploy_pages.yml` | Push to `main` (data or site changes) | Deploys site to GitHub Pages |

## Enabling GitHub Pages

1. Go to **Settings → Pages** in this repository
2. Under **Source**, select **GitHub Actions**
3. The next push to `main` will trigger a deployment

## Running the Data Fetch Locally

```bash
python scripts/fetch_data.py
```

Requires Python 3.8+ and no additional dependencies (uses the standard library only).
