# ⛨ WUNDERAUDIT // Active Crypto Audit Challenges

> **A live, daily-updated monitor of every open crypto security challenge** — smart-contract audit contests, Web3 bug bounties, crypto/blockchain CTFs and Web3 hackathons — with live countdowns, a deadline calendar and an auditor matchmaker. Sister site to [ActiveQuantCompetitions](https://oogwayseinse.github.io/ActiveQuantCompetitions/) and [ActiveMLCompetitions](https://oogwayseinse.github.io/ActiveMLCompetitions/).

[![Daily Crypto Challenges Update & Deploy](https://github.com/OogwaySeinse/ActiveCryptoAuditChallenges/actions/workflows/daily-update.yml/badge.svg)](https://github.com/OogwaySeinse/ActiveCryptoAuditChallenges/actions/workflows/daily-update.yml)

**Live site (after first deploy):** https://oogwayseinse.github.io/ActiveCryptoAuditChallenges/

## ✨ What it tracks

| Source | Module | What | How |
| --- | --- | --- | --- |
| **Code4rena** | `code4rena.py` | Active + upcoming competitive audits | Next.js RSC payload on `/audits` (Active/Upcoming buckets) |
| **Sherlock** | `sherlock.py` | Running/upcoming contests & public bug bounties | Public `/api/contests` JSON |
| **Cantina** | `cantina.py` | Live competitions **and** public bug bounties | `/api/v0/competitions`, `/api/v0/bounties` |
| **Cyfrin CodeHawks** | `codehawks.py` | Competitive audits & First Flights | SvelteKit-embedded tRPC payload |
| **Immunefi** | `immunefi.py` | Bug bounties (≥ $10K, not paused) + audit competitions | RSC payloads on `/bug-bounty/` & `/audit-competition/` |
| **CTFtime** | `ctftime.py` | Open online CTFs, next 3 weeks (blockchain-tagged when relevant) | Public events API |
| **ETHGlobal** | `ethglobal.py` | Upcoming/live hackathons | RSC payload on `/events` |
| **Devpost** | `devpost.py` | Open/upcoming *Blockchain*-themed hackathons | Public hackathons API |
| **Curated** | `curated.py` | Evergreen practice: Ethernaut, Damn Vulnerable DeFi, EVM Puzzles, CryptoHack, Cryptopals… | Static list |

Every record is normalised into one schema (`scraper/models.py`): USD-normalised prize (USDC/ETH/OP/ARB/… via live FX + CoinGecko), start/end, live status (`active`, `ending_soon`, `upcoming`, `ongoing`), **challenge type**, **protocol domain** (Lending, DEX & AMM, Bridges, ZK, L1/L2…), **ecosystem** (EVM, Solana, Move, Cosmos, Starknet…), **languages**, difficulty tier, KYC flag, repo link and findings count. Records are deduplicated (URL + fuzzy title), annotated with first-seen / NEW / prize-delta / deadline-shift history, and written to `data/challenges.{json,csv}`.

If a source breaks, the pipeline falls back to its last good snapshot (re-validated against today's date so expired items drop out) and the dashboard's **feed health** panel shows it.

## 🖥️ Dashboard (`apps/dashboard/`)

React 18 + Vite 6 + TypeScript + Tailwind v4 + TanStack Table + Recharts, styled like the sibling arenas (cream frame, smoked glass, drifting exploit/opcode ASCII canvas).

- **Hero** with a pausable *Closing next* ticker and flagship prize cards.
- **Live Arena** (`#live-arena`): view segments (⚡ Live Contests · Audits · Bug Bounties · CTFs · Hackathons · Practice · All), quick presets (closing ≤ 7d, ≥ $50K, beginner-friendly, new, saved), facets for platform / domain / ecosystem / language / status / tier / min pool, live minute-level countdowns, elapsed-window meters, bookmarks, shareable URL filters, CSV export, and **one-click `.ics` calendar export with a 24h reminder**.
- **Telemetry** tab: venues, 8-week deadline calendar, domain donut, ecosystems and a daily trend (from `data/history/snapshots`).
- **Auditor Matchmaker** (`#ai-matchmaker`): archetypes (Solidity Warden, Rust/Solana Hunter, First Valid Finding, Crypto CTF Player, Web3 Builder) + brief, languages, types, experience, goal and hours/week → ranked matches with *why it fits*, watch-outs and a phase-by-phase execution plan. Runs fully in the browser; optionally refined by a Gemini Cloudflare Worker.
- The page re-polls `challenges.json` every 10 minutes and hides anything whose deadline passes while the tab is open.

## 🚀 Quickstart

```powershell
# Python 3.11+
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m pytest -q
.venv\Scripts\python -m scraper                    # all sources
.venv\Scripts\python -m scraper --only cantina sherlock   # subset

# Dashboard (Node 20+)
cd apps/dashboard
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

The scraper writes `data/challenges.json` / `.csv` and mirrors them into `apps/dashboard/public/data/`.

## ☁️ Deploy to GitHub Pages

1. Push this folder to `https://github.com/OogwaySeinse/ActiveCryptoAuditChallenges`.
2. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
3. *Actions → "Daily Crypto Challenges Update & Deploy" → Run workflow.*

It then refreshes every day at **06:00 UTC**. No API keys are required for any source.

## ✦ Optional: Gemini worker for the Matchmaker

```powershell
cd workers/recommender
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

Paste the Worker URL into **⚙ Connect Gemini worker** in the Matchmaker, or set a repository variable `VITE_RECOMMENDER_URL` so builds use it automatically. If the worker is unreachable the local ranker is used transparently.

## Repository layout

```
scraper/                 python -m scraper
  sources/               one module per platform
  flight.py              Next.js RSC payload parser (C4, Immunefi, ETHGlobal)
  normalize.py           prizes→USD, dates/status, domain/ecosystem/language taxonomy
  dedupe.py, history.py, fx.py, pipeline.py
tests/                   pytest (parsers, normalisation, dedupe)
data/                    challenges.json/.csv, cache/, history/
apps/dashboard/          React dashboard
workers/recommender/     optional Gemini proxy (Cloudflare Worker)
.github/workflows/       daily scrape → commit → build → Pages
```

> Always confirm scope, rules, eligibility and KYC requirements on the official challenge page before participating.

