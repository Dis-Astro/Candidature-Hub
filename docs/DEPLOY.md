# Installazione e gestione

## Servizi

- `db`: PostgreSQL.
- `app`: interfaccia web, API, amministrazione e backup.
- `parser`: scansione ricorsiva cartelle email/manuale, PDF/OCR e importazione.
- `mail-worker`: IMAP e conversione email in PDF.
- `clamav`: antivirus isolato, con firme aggiornate automaticamente.
- `migrate`: applicazione automatica delle migrazioni prima dell'avvio.
- `restore`: strumento manuale, attivo soltanto con il profilo `tools`.

## Storage

Il volume Docker `app-storage` è condiviso dai servizi e conserva i documenti anche quando i container vengono ricreati. La webapp vede esclusivamente `/data`, senza accesso al filesystem completo dell'host o al motore Docker.

Le destinazioni operative si cambiano in Admin usando percorsi relativi, per esempio `inbox/mail` oppure `archivio/cv-elaborati`. Devono essere cartelle distinte e rimanere nello spazio dell'app; al salvataggio vengono create e verificate in lettura e scrittura.

I PDF oltre 50 MB, corrotti o non elaborabili vengono spostati in `/data/error` per evitare tentativi infiniti. Dopo la correzione possono essere ricopiati nella cartella manuale.

## Email

Le impostazioni IMAP/SMTP vengono rilette a ogni ciclo. Le password sono cifrate con AES-256-GCM usando `CONFIG_ENCRYPTION_KEY`, conservata soltanto nell'ambiente Docker.

Prima di cambiare casella è consigliato creare un backup e disabilitare temporaneamente l'acquisizione email. Dopo il salvataggio non serve riavviare il worker.

Il pulsante **Verifica collegamento email** prova l'accesso alla cartella IMAP indicata e, se configurato, anche l'accesso SMTP senza inviare messaggi.

## Antivirus

ClamAV ascolta soltanto nella rete interna Docker e non espone porte al server. Webapp, parser e lettore email usano il protocollo `INSTREAM`; con `ANTIVIRUS_REQUIRED=1` i nuovi file vengono rifiutati se la scansione non è disponibile. Le firme sono conservate nel volume `clamav-data` e aggiornate dal container ufficiale.

## Sicurezza

- Esporre l'app dietro HTTPS/reverse proxy.
- Limitare la porta 3031 alla rete aziendale.
- Conservare `.env` con permessi restrittivi.
- Ruotare periodicamente password DB/IMAP/SMTP.
- Assegnare `VIEWER`, `RECRUITER` o `ADMIN` secondo il minimo privilegio.
- Non inserire CV reali nel repository Git.

## Backup

Verificare regolarmente il ripristino su un ambiente separato. Un backup non testato non è una garanzia di recupero. Copiare gli archivi anche fuori dal server principale.

## Aggiornamento

1. Creare un backup.
2. `git pull`.
3. `docker compose up -d --build`.
4. Controllare `docker compose ps` e `docker compose logs migrate parser mail-worker app`.
