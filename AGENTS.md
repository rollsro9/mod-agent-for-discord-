# Agent handoff — mod-agent-for-discord

Bot Discord LLM-powered per il server **"GTA VI Mapping & Leaks"** di Lorenzo (community di leonidaleaks.com, progetto in `C:\Users\Lorenzo\AI\gta-website` — vedi il suo `CHECKPOINT.md` per il contesto generale).

## Stato (2026-07-16 pomeriggio)

- **Controllo automatico permessi all'avvio** (`verifyChannelPermissions` in `src/index.ts`): verifica autonomamente che il bot disponga dei permessi `ViewChannel` e `SendMessages` in tutti i canali configurati (mod, welcome, news, general, proactive) al boot, stampando warning in console e segnalando eventuali mancanze in `#moderator-only`.
- **Utility QA Welcome (`!testwelcome`)**: aggiunto comando riservato agli amministratori per simulare all'istante l'arrivo di un membro e testare la formattazione e i fallbacks del welcome message LLM-powered.
- **Prevenzione double-posting su riavvio**: migliorata la stabilità di `NewsWatcher` e `DigestCollector` leggendo la data dell'ultimo invio direttamente dal persistente `diary.md` sul tick iniziale.
- **Miglioramento log di diagnostica**: inserito logging di precisione all'ora di post per evidenziare skips e statistiche.
- **Taratura prezzi Z.ai confermata**: verificato il listino ufficiale (gratuito per `glm-4.5-flash`/`glm-4.7-flash` e $0.60/$2.20 per `glm-4.6` per 1M token) e allineati `config.yaml` e `config.example.yaml`.
- **Docker e Deploy**: `Dockerfile` pronto per deploy 24/7 su VPS Oracle Cloud. Gira manualmente in locale in fase di test.

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

1. **Test rassegna news**: Avviare il bot (`npm run dev`) per far girare i log. Grazie al nuovo logging, se l'ora UTC coincide, il bot stamperà in console i dettagli di fetch e del caricamento dei feed (verificando se l'LLM risponde o se i feed contengono elementi).
2. **QA Welcome**: Digitare `!testwelcome` in un canale pubblico del server Discord (funziona solo per amministratori) per verificare il comportamento e il look del welcome message generato dall'LLM.
3. **Deploy 24/7**: VPS free tier (Oracle Cloud, deciso da Lorenzo) via `Dockerfile`.
4. **Pubblicare su GitHub**: inizializzare il remote repository ed effettuare il push del codice.

## Regole di lavoro (le stesse del progetto gta-website)

- ⚠️ VIETATO riscrivere history git: no `--amend`, no rebase, no `reset --hard`, no force-push. Solo commit in avanti, `git revert` per annullare.
- Commit frequenti e descrittivi: il `git log` è la traccia tra agenti.
- `npm run typecheck` prima di ogni commit.
- A fine sessione aggiorna questo file (sezione Stato + task aperti).
