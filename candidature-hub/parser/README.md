# Parser CV - Candidature Hub

Estrae automaticamente dati dai CV PDF e li inserisce nel database.

## Requisiti sistema

```bash
# Tesseract OCR (opzionale, per PDF scansionati)
apt-get install tesseract-ocr tesseract-ocr-ita poppler-utils

# Python dependencies
pip install -r requirements.txt

# Modello spaCy italiano (per NER nome/cognome)
python -m spacy download it_core_news_sm
```

## Configurazione

Variabili ambiente:

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `WATCH_DIR` | `/mnt/nas_curriculum/mail2pdf` | Cartella da monitorare |
| `PROCESSED_DIR` | `$WATCH_DIR/processed` | Dove spostare i PDF elaborati |
| `DATABASE_URL` | - | Connection string PostgreSQL |
| `OCR_ENABLED` | `0` | Abilita OCR per PDF scansionati (`1` per abilitare) |
| `OCR_LANG` | `ita` | Lingua tesseract |
| `ONCE` | `0` | Esegui una sola volta (`1` per abilitare) |

## Estrazione nomi

Il parser usa più strategie in ordine di priorità:

1. **NER spaCy** - Riconoscimento entità italiane (più accurato)
2. **Heuristic testo** - Pattern Nome Cognome nelle prime righe
3. **Filename** - Estrazione da nome file (es. `CV Mario Rossi.pdf`)
4. **Email** - Fallback da indirizzo email

## Esecuzione

```bash
# Singola esecuzione
ONCE=1 python parser.py

# Daemon (loop ogni 30s)
python parser.py

# Con OCR abilitato
OCR_ENABLED=1 python parser.py
```

## systemd

Vedi `../systemd/parser.service` e `parser.timer` per esecuzione schedulata.
