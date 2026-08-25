# Evoluzione mobile iOS e Android

## Principio Tablet First

Il client è progettato prima di tutto per iPad e tablet Android, gli strumenti principali durante selezione e colloqui. Le schermate funzionano in verticale e orizzontale, usano bersagli tattili di almeno 44 px, non dipendono dall'hover e mantengono visibili le azioni principali. Smartphone e desktop sono adattamenti dello stesso flusso, non il riferimento progettuale principale.

## Architettura scelta

Il sistema resta composto da un unico backend on-premise in Docker:

- Next.js espone UI web e API HTTPS;
- PostgreSQL conserva dati e sessioni;
- parser e mail worker acquisiscono i curriculum;
- il volume Docker permanente `/data` conserva documenti e backup.

La UI condivisa viene resa progressivamente responsive e installabile come PWA. Le applicazioni iOS e Android saranno contenitori Capacitor con funzioni native mirate, non una seconda implementazione del CRM.

Le app mobili non girano in Docker: Docker ospita il servizio centrale. I pacchetti `.ipa` e `.aab` vengono compilati rispettivamente con Xcode/macOS e Android Studio/CI, quindi si collegano via HTTPS al server Docker.

## Base mobile già disponibile

- `GET /api/v1/capabilities`: versione e funzionalità supportate.
- `POST /api/v1/auth/login`: restituisce token Bearer e scadenza.
- `GET /api/v1/me`: verifica token e utente.
- `POST /api/v1/auth/logout`: revoca la sessione.
- Le API esistenti accettano sia cookie web sia `Authorization: Bearer TOKEN`.
- Le mutazioni Bearer non dipendono dalla protezione CSRF same-origin dei cookie.
- `MOBILE_ALLOWED_ORIGINS` limita le origini WebView ammesse.

Il token deve essere conservato nel Keychain iOS o nell'Encrypted Storage Android. Non deve essere scritto in file, log o preferenze non cifrate.

## Connessione al server

Per l'uso fuori dalla LAN sono necessari:

1. nome DNS stabile;
2. HTTPS con certificato attendibile;
3. reverse proxy davanti alla porta interna `3031`;
4. VPN o accesso Zero Trust, preferibile all'esposizione diretta su Internet;
5. `COOKIE_SECURE=1` nell'ambiente di produzione.

L'app deve mostrare uno stato chiaro quando il server non è raggiungibile. I CV e gli allegati non vengono memorizzati offline per impostazione predefinita.

## Fasi successive

1. Definire distribuzione: App Store/Play Store, MDM aziendale o installazione privata.
2. Creare workspace Capacitor condiviso e schermata iniziale di configurazione server.
3. Aggiungere storage sicuro del token, biometria opzionale e deep link.
4. Integrare fotocamera/scanner PDF e condivisione file nativa.
5. Aggiungere notifiche push per nuovi CV, errori parser e candidature da valutare.
6. Test end-to-end su dispositivi reali, accessibilità e perdita di rete.
7. Informativa privacy, retention mobile e procedura di revoca dispositivi.

## Vincolo di distribuzione iOS

Una semplice WebView del sito rischia di non superare la revisione. La versione destinata allo store deve offrire valore nativo reale: scansione documenti, notifiche, condivisione, biometria e comportamento coerente con iOS.
