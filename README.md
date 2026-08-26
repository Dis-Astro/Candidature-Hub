# Candidature Hub

Piattaforma on-premise per acquisire CV da email o cartelle manuali, estrarne i dati e gestire candidature e colloqui. L'intero sistema gira con Docker Compose.

La stessa interfaccia è predisposta come PWA responsive e dispone di API Bearer versionate per i futuri client iOS e Android. L'architettura mobile è descritta in [docs/MOBILE.md](docs/MOBILE.md).

L'interfaccia segue un approccio **Tablet First**: iPad e tablet Android sono il riferimento principale per navigazione, colloqui e valutazione; desktop e smartphone restano supportati.

### Esperienza iPad First

- rail laterale persistente in verticale e orizzontale, che si espande sui desktop ampi;
- archivio candidati a schede su iPad, con tabella riservata agli schermi desktop;
- bersagli tattili da almeno 48 px, aree sicure iOS e assenza di azioni dipendenti dall'hover;
- dashboard, filtri, scheda candidato e login ottimizzati per le proporzioni 4:3;
- PWA installabile con scorciatoie per nuovo candidato, archivio e importazioni.

## Avvio rapido

1. Copiare `.env.example` in `.env`.
2. Generare password casuali e `CONFIG_ENCRYPTION_KEY` con `openssl rand -base64 32`.
3. Avviare: `docker compose up -d --build`.
4. Creare o reimpostare l'amministratore:

   `docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_NAME app node scripts/create-admin.mjs`

5. Aprire `http://SERVER:3031`, accedere e completare la configurazione Admin.

La chiave di cifratura non deve essere cambiata senza prima decifrare/reinserire le password salvate.

## Acquisizione CV

- Email: il worker salva gli allegati in `/data/inbox/mail` quando IMAP è abilitato nell'area Admin.
- Manuale/scanner: copiare PDF in `/data/inbox/manual` o in qualsiasi sua sottocartella.
- Il parser legge ricorsivamente entrambe le cartelle, estrae i dati e sposta i file in `/data/processed/AAAA-MM`.
- ClamAV controlla curriculum e allegati prima che vengano acquisiti; gli elementi sospetti sono bloccati e visibili in **Importazioni**.

I documenti sono conservati nel volume Docker permanente `app-storage`: non è richiesto un NAS o un percorso del computer host. Dall'area Admin si possono cambiare separatamente le cartelle per email, caricamenti manuali, file elaborati, allegati, errori e backup. Le cartelle vengono create e verificate automaticamente al salvataggio.

Per spostare l'installazione su un altro server si usa il backup completo esportabile dalla webapp, che contiene sia il database sia tutti i documenti.

## Backup e ripristino

I backup Admin contengono un dump PostgreSQL e tutto lo storage, esclusa la cartella dei backup stessa. Possono essere scaricati o caricati dall'interfaccia.

Per ripristinare:

1. `docker compose stop app parser mail-worker`
2. `docker compose --profile tools run --rm restore /data/backups/NOME-BACKUP.tar.gz`
3. `docker compose up -d`

La stessa procedura permette di cambiare server PostgreSQL: si aggiorna `DATABASE_URL`/la configurazione Compose e si applica l'archivio al nuovo database.

Consultare [docs/DEPLOY.md](docs/DEPLOY.md) per operazioni, sicurezza e diagnosi.

## Avvio su iPad Simulator

Il client iOS usa Capacitor e si trova in `candidature-hub/app/ios`.

1. Verificare che la webapp sia raggiungibile su `http://192.168.0.37:3031`.
2. Da `candidature-hub/app`, eseguire `pnpm ios:sync`.
3. Eseguire `pnpm ios:open`, scegliere un simulatore iPad in Xcode e premere Run.

Per collegarsi a un server diverso, impostare `CAPACITOR_SERVER_URL=https://SERVER` prima di `pnpm ios:sync`. In produzione usare sempre HTTPS.
