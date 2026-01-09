# Candidature-Hub - Product Requirements Document

## Overview
Sistema di gestione candidature on-premise composto da:
1. **mail2pdf** (Python): Legge email, estrae allegati PDF, salva su NAS
2. **Parser** (Python): Analizza PDF, estrae info candidati con NER/OCR, scrive su PostgreSQL
3. **App Web** (Next.js + Prisma): UI per gestire candidati, colloqui, valutazioni

## Tech Stack
- Frontend: Next.js 16 + React 19 + Tailwind CSS
- Backend: Python (parser, mail2pdf)
- Database: PostgreSQL con Prisma ORM
- Deployment: systemd services su server on-premise

## Completed Features

### 2025-01-09
- ✅ **Fix Logo Certificato**: Rimosso watermark dalla lista candidati, logo ora appare di fianco al cognome in trasparenza per candidati certificati
- ✅ **Parser NER/OCR Migliorato**: 
  - Pipeline estrazione nomi: Heuristic strutturata → Filename → Email → NER spaCy
  - Supporto pattern "Curriculum Vitae di X Y", "Nome: X" "Cognome: Y"
  - Integrazione OCR on/off leggibile dal DB SystemConfig
  - Test passati su 3 PDF reali (Tommaso Sammaciccia, Gianni Piatti, Elisabetta Reale)
- ✅ **Lint Fix**: Corretti errori ESLint (apostrofo escaped, tipo any→unknown)

### Precedenti sessioni
- Lista candidati con filtri, paginazione, sorting
- Scheda dettaglio candidato con form colloquio compatto
- QuickActions (Scarta/Valida/Ripristina/Certifica)
- Gestione allegati con validazione MIME/dimensione
- Pagina Admin con config sistema (NAS paths, IMAP, retention GDPR)
- Test connessione DB esterno
- Indicatore "Certificato" 🏆 basato su keyword [SCEMO]
- Audit Log per azioni critiche

## Backlog

### P1 - Prossimi task
- [ ] Filtro "Da valutare" nella lista candidati
- [ ] Navigazione rapida (←/→) tra candidati "da valutare"
- [ ] Export CSV lista candidati

### P2 - Medio termine
- [ ] Auth/Ruoli (ADMIN, RECRUITER, VIEWER)
- [ ] Estensione Audit Log

### P3 - Bassa priorità
- [ ] Miglioramenti UI/UX minori

### Escluso
- ❌ Fuzzy matching per deduplica candidati (esplicitamente rifiutato)

## Key Files
- `/app/candidature-hub/parser/parser.py` - Parser PDF con NER/OCR
- `/app/candidature-hub/app/prisma/schema.prisma` - Schema database
- `/app/candidature-hub/app/app/candidates/page.tsx` - Lista candidati
- `/app/candidature-hub/app/app/candidates/InterviewForm.tsx` - Scheda candidato
- `/app/candidature-hub/app/app/admin/page.tsx` - Pagina amministrazione

## Notes
- L'app è on-premise, il codice viene deployato tramite `git pull` sul server
- Il parser legge la config OCR dal DB SystemConfig ad ogni ciclo
- I test del parser vanno eseguiti sul server con DATABASE_URL configurato
