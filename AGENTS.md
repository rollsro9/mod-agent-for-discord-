# Agent handoff — mod-agent-for-discord

Bot Discord LLM-powered per il server **"GTA VI Mapping & Leaks"** di Lorenzo (community di leonidaleaks.com, progetto in `C:\Users\Lorenzo\AI\gta-website` — vedi il suo `CHECKPOINT.md` per il contesto generale).

## Stato (2026-07-16 notte)

**Funzionante e testato live**: Q&A su mention ✓, flag moderazione in #moderator-only ✓. Bot = app Discord "Leonida Mod Agent#9393". Gira SOLO manualmente: `npm run dev` (nessun deploy 24/7 ancora).

## Cosa è

Agente community completo (TypeScript + discord.js + LLM via Z.ai/GLM):
- **Moderazione flag-only**: regex prefilter (`src/moderation/prefilter.ts`) → classifier glm-4.5-flash → casi high-severity rivisti da glm-4.6 → embed in #moderator-only. **MAI azioni automatiche, MAI auto-ban** (regola ferrea di Lorenzo).
- **Q&A membri** (`src/interactions/chat.ts`): mention/reply ovunque + domande in #general. FAQ in config = ground truth.
- **Welcome personalizzati**, **reazioni emoji** probabilistiche, **post spontanei** (`src/proactive.ts`), **digest staff giornaliero** (20 UTC), **rassegna news pubblica** (`src/news.ts`, 16 UTC in #news-leaks, fonti RSS r/GTA6 + Google News).
- **Memoria persistente** in `data/` (gitignored): `lore.md` (editabile a mano), `diary.md` (auto), `members/<id>.md` (note sui membri). Identità condivisa in `src/persona.ts` (superfan GTA VI + countdown lancio 2026-11-19).
- **Budget cap** 0,50$/gg hard (`src/budget.ts`), esaurito → degrada a regex-only.

## Segreti e config

- `.env` (gitignored): `DISCORD_TOKEN` + `GLM_API_KEY` (key z.ai dedicata "mod-agent-discord"). NON committare.
- `config.yaml` (gitignored) = config live con ID canali reali. `config.example.yaml` = template committato.
- ID canali: mod=1521893151655071827, welcome=1521896496725753866, general=1521585150578655293, news-leaks=1521900171288379422.

## TASK APERTI (in ordine)

1. **Test rassegna news NON concluso**: al test live (post_hour_utc temporaneo) nessun post e nessun errore nei log — probabile SKIP dell'LLM o 0 item dai feed. Ho aggiunto logging diagnostico in `src/news.ts` (righe `news: ...`). Ritestare: metti `post_hour_utc` all'ora UTC corrente in `config.yaml`, `npm run dev`, aspetta il tick (60s), leggi i log, poi RIMETTI `16`.
2. **Verifica permessi Send del bot** su #news-leaks e #welcome (canali dove @everyone non scrive) — condizione necessaria per news e welcome.
3. **Welcome da testare** col primo membro vero.
4. **Deploy 24/7**: VPS free tier (Oracle Cloud, deciso da Lorenzo). `Dockerfile` pronto.
5. **Pubblicare su GitHub** (obiettivo: repo open-source per stelle). Nessun remote configurato.
6. Tarare `llm.pricing` in config.yaml sul listino z.ai reale (valori attuali = stime).

## Regole di lavoro (le stesse del progetto gta-website)

- ⚠️ VIETATO riscrivere history git: no `--amend`, no rebase, no `reset --hard`, no force-push. Solo commit in avanti, `git revert` per annullare.
- Commit frequenti e descrittivi: il `git log` è la traccia tra agenti.
- `npm run typecheck` prima di ogni commit.
- A fine sessione aggiorna questo file (sezione Stato + task aperti).
