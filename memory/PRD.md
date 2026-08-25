# Candidature Hub - Product Requirements

## Obiettivo

Sistema HR on-premise in Docker Compose per acquisire, archiviare, cercare e valutare candidature mantenendo database e documenti trasferibili tramite backup completi, con accesso web, PWA e futuri client iOS/Android.

La UX è Tablet First: iPad e tablet Android costituiscono il formato principale, con controlli touch e layout adatti a orientamento verticale e orizzontale.

## Componenti

1. `mail-worker`: acquisizione IMAP configurabile e conversione email/PDF.
2. `parser`: scansione ricorsiva degli ingressi email e manuali, estrazione PDF/OCR e importazione PostgreSQL.
3. `app`: UI Next.js con candidati, colloqui, allegati, ruoli, configurazione, retention e backup.
4. `db`: PostgreSQL con migrazioni Prisma automatiche.

## Requisiti principali

- Login e ruoli `ADMIN`, `RECRUITER`, `VIEWER`.
- Credenziali operative cifrate fuori dal codice.
- Cambio email senza deploy o riavvio.
- Storage Docker permanente con destinazioni configurabili dalla webapp.
- Cartella manuale ricorsiva e caricamento multiplo fino a 50 PDF.
- Quarantena dei documenti non elaborabili.
- Candidature multiple intenzionali con indice di invio.
- Stato candidatura esplicito e audit delle operazioni critiche.
- Backup completo portabile: dump PostgreSQL più storage.
- Importazione archivio da UI e ripristino transazionale a servizi fermi.
- UI responsive installabile e API v1 con token Bearer per client mobili.
- Nessuna cache offline predefinita di CV o dati HR sui dispositivi.

## Vincoli

- I file devono rimanere sotto `/data` all'interno dei container.
- Il mount fisico NFS/SMB è responsabilità del sistema operativo host.
- I CV reali non devono essere conservati nel repository Git.
- La deduplicazione fuzzy resta esclusa; viene impedito soltanto il retry tecnico dello stesso file.

## Roadmap residua

- Metriche e notifiche operative avanzate.
- Test browser end-to-end della UI.
- Wrapper Capacitor iOS/Android con Keychain/Encrypted Storage.
- HTTPS/VPN, configurazione server mobile e revoca dispositivi.
- Scansione documenti, notifiche push e biometria opzionale.
