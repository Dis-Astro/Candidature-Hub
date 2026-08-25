# Parser CV

Worker Docker che estrae dati dai PDF e li inserisce in PostgreSQL.

## Ingressi

I percorsi sono letti da `SystemConfig` a ogni ciclo:

- `mailInboxPath`: PDF ottenuti dal worker IMAP;
- `manualInboxPath`: PDF copiati, scansionati o caricati manualmente;
- entrambe le directory vengono percorse ricorsivamente;
- `processedPath`: archivio dei documenti elaborati;
- `errorPath`: quarantena per file non validi o non elaborabili.

Il limite è 50 MB per PDF. Un `sourceKey` rende idempotente il riavvio dopo un'importazione già registrata.

## Estrazione

1. testo con pypdf;
2. fallback pdfminer;
3. OCR Tesseract italiano, se abilitato e il PDF non contiene testo;
4. nome/cognome da pattern strutturati;
5. filename;
6. email;
7. spaCy NER come ultima risorsa.

Ogni invio valido crea una candidatura distinta e incrementa `submissionIndex` per lo stesso nome e cognome.

## Test

`python -m unittest discover -s tests -v`
