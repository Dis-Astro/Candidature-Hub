#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Candidature Hub — Parser PDF (UTF-8 safe, per-file TX)

- Estrazione testo (pypdf -> pdfminer -> OCR)
- NER italiano (spaCy) per nome/cognome
- Heuristics fallback: email, telefono, filename
- Transazione per file; import_events sempre scritto con connessione separata
- Ogni PDF crea SEMPRE un nuovo candidato
  → submissionIndex = progressivo per stesso nome + cognome
"""

import os
import sys
import time
import hashlib
import re
import subprocess
import uuid
import datetime
import traceback
from typing import Optional, Tuple, List

import psycopg2
import psycopg2.extras
from workers.runtime_config import ensure_storage, load_config
from workers.antivirus import scan_file

# --- stdout/stderr UTF-8 safe ---
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# --- dipendenze PDF ---
try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None

try:
    from pdfminer.high_level import extract_text as pdfminer_extract_text
except Exception:
    pdfminer_extract_text = None

# --- OCR (opzionale) ---
try:
    import pytesseract
    from pdf2image import convert_from_path
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    pytesseract = None
    convert_from_path = None

# --- NER spaCy (opzionale) ---
NLP = None
try:
    import spacy
    # Carica modello italiano (deve essere installato: python -m spacy download it_core_news_sm)
    try:
        NLP = spacy.load("it_core_news_sm")
        print("[BOOT] spaCy NER italiano caricato", flush=True)
    except OSError:
        print("[WARN] Modello spaCy it_core_news_sm non trovato. Esegui: python -m spacy download it_core_news_sm", flush=True)
        NLP = None
except ImportError:
    print("[WARN] spaCy non installato, NER disabilitato", flush=True)


# === helpers UTF-8 ===
def _safe(s: str) -> str:
    try:
        return (s or "").encode("utf-8", "replace").decode("utf-8")
    except Exception:
        return "<?>"


# === Config ===
WATCH_DIR = os.environ.get("WATCH_DIR", "/data/inbox/manual")
DATABASE_URL = os.environ.get("DATABASE_URL")
PROCESSED_DIR = os.environ.get("PROCESSED_DIR", os.path.join(WATCH_DIR, "processed"))
ERROR_DIR = os.environ.get("ERROR_DIR", "/data/error")
OCR_LANG = os.environ.get("OCR_LANG", "ita")  # tesseract language

# OCR_ENABLED viene letto dal DB SystemConfig se disponibile, altrimenti da env
_OCR_ENABLED_ENV = os.environ.get("OCR_ENABLED", "0") == "1"


def get_ocr_enabled_from_db() -> bool:
    """Legge l'impostazione ocrEnabled dalla tabella system_config."""
    global DATABASE_URL
    if not DATABASE_URL:
        return _OCR_ENABLED_ENV
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor() as cur:
            cur.execute('SELECT "ocrEnabled" FROM system_config WHERE id = %s', ("main",))
            row = cur.fetchone()
            if row:
                return bool(row[0])
        conn.close()
    except Exception as e:
        print(f"[WARN] Impossibile leggere ocrEnabled dal DB: {e}", file=sys.stderr)
    return _OCR_ENABLED_ENV


def _sanitize_filename(name: str) -> str:
    """Normalizza nomi file per evitare problemi su URL/FS."""
    import unicodedata
    n = unicodedata.normalize("NFKD", name)
    n = "".join(ch for ch in n if not unicodedata.combining(ch))
    n = (n.replace(""", '"').replace(""", '"')
           .replace("'", "'").replace("'", "'")
           .replace("–", "-").replace("—", "-"))
    out = []
    for ch in n:
        o = ord(ch)
        if ch.isalnum() or ch in " ._()-":
            out.append(ch)
        elif ch in ["'", '"', ",", ";", ":", "+", "&", "@", "!"]:
            out.append("_")
        else:
            if o < 32:
                continue
            out.append("_")
    n = "".join(out)
    n = re.sub(r"[ \t]+", " ", n).strip()
    n = re.sub(r"_+", "_", n)
    n = re.sub(r"\s*_\s*", "_", n)
    if not n:
        n = "file.pdf"
    if not n.lower().endswith(".pdf"):
        n += ".pdf"
    return n


# === Regex & normalizzazioni ===
RE_EMAIL = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
RE_PHONE = re.compile(r"(?:\+?\d[\d\-\s\.\/]{7,}\d)")  # almeno 7 cifre per evitare date

# Parole da escludere come nome/cognome (comuni nei CV)
EXCLUDED_WORDS = {
    "curriculum", "vitae", "cv", "europass", "pdf", "doc", "docx",
    "email", "telefono", "tel", "cell", "mobile", "indirizzo", "address",
    "nato", "nata", "data", "nascita", "residenza", "domicilio",
    "istruzione", "formazione", "esperienza", "lavoro", "competenze",
    "skills", "lingua", "lingue", "patente", "hobby", "interessi",
    "allegato", "allegati", "pagina", "page", "di", "del", "della",
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
    "professionale", "profilo", "ingegnere", "ingegneria", "geometra",
    "esame", "stato", "laurea", "universita", "università", "oggetto",
    "candidatura", "ricerca", "azienda", "gestione", "sistemi", "nome", "cognome",
}


def normalize_email(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    return s.strip().lower()


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    raw = raw.strip()
    sign = "+" if raw.startswith("+") else ""
    digits = re.sub(r"\D", "", raw).lstrip("0")
    return (sign + digits) if digits else None


def pick_email(text: str) -> Optional[str]:
    m = RE_EMAIL.search(text or "")
    return normalize_email(m.group(0)) if m else None


def pick_phone(text: str) -> Optional[str]:
    m = RE_PHONE.search(text or "")
    return normalize_phone(m.group(0)) if m else None


def is_valid_name(name: str) -> bool:
    """Verifica se una stringa è un nome valido (non parola comune CV)."""
    if not name or len(name) < 2:
        return False
    if name.lower() in EXCLUDED_WORDS:
        return False
    # Solo lettere
    if not re.match(r"^[A-Za-zÀ-ÿ\-\']+$", name):
        return False
    return True


def extract_names_ner(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Estrae nome e cognome usando spaCy NER italiano.
    Cerca entità PER (persona) nel testo.
    """
    if not NLP or not text:
        return (None, None)
    
    # Limita testo per performance (primi 3000 caratteri)
    doc = NLP(text[:3000])
    
    persons: List[str] = []
    for ent in doc.ents:
        if ent.label_ == "PER":
            # Pulisci e valida
            name = ent.text.strip()
            # Rimuovi titoli comuni
            name = re.sub(r"^(Sig\.|Sig\.ra|Dott\.|Dott\.ssa|Ing\.|Avv\.)\s*", "", name, flags=re.I)
            if name and len(name.split()) >= 1:
                persons.append(name)
    
    if not persons:
        return (None, None)
    
    # Prendi la prima persona trovata
    full_name = persons[0]
    parts = full_name.split()
    
    if len(parts) >= 2:
        fn = parts[0].capitalize()
        ln = parts[-1].capitalize()
        if is_valid_name(fn) and is_valid_name(ln):
            return (fn, ln)
    
    if len(parts) == 1 and is_valid_name(parts[0]):
        return (parts[0].capitalize(), None)
    
    return (None, None)


def derive_names_from_email(email: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not email:
        return (None, None)
    u = email.split("@", 1)[0]
    u = re.sub(r"[^a-zA-Z\.]+", " ", u)
    u = re.sub(r"\s+", " ", u).strip()
    parts = [p for p in u.replace(".", " ").split(" ") if p and is_valid_name(p)]
    if len(parts) >= 2:
        return (parts[0].capitalize(), parts[-1].capitalize())
    if len(parts) == 1:
        return (parts[0].capitalize(), None)
    return (None, None)


def derive_names_from_filename(path: str) -> Tuple[Optional[str], Optional[str]]:
    """Estrae Nome Cognome dal nome del file PDF."""
    base = os.path.basename(path)
    base = os.path.splitext(base)[0]
    
    # Normalizza: sostituisci separatori con spazi
    cleaned = re.sub(r"[_\-\.]+", " ", base)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    
    # Rimuovi prefissi comuni
    cleaned = re.sub(r"^(CV|Candidatura|Curriculum)[_\s\-]*", "", cleaned, flags=re.I)
    
    # Pattern 1: "Nome Cognome" diretto
    m = re.search(r"\b([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]{2,})\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]{2,})\b", cleaned)
    if m:
        fn = m.group(1).capitalize()
        ln = m.group(2).capitalize()
        if is_valid_name(fn) and is_valid_name(ln):
            return fn, ln
    
    # Pattern 2: "Nome geom COGNOME" (con titolo in mezzo)
    m = re.search(r"\b([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]{2,})\s+(?:geom\.?|ing\.?|dott\.?)\s*([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]{2,})\b", cleaned, re.I)
    if m:
        fn = m.group(1).capitalize()
        ln = m.group(2).capitalize()
        if is_valid_name(fn) and is_valid_name(ln):
            return fn, ln
    
    return (None, None)


def derive_names_from_text_heuristic(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Cerca pattern strutturati come "Nome: X" "Cognome: Y" o "Curriculum Vitae di X Y"
    e pattern Nome Cognome nelle prime righe del CV.
    """
    if not text:
        return (None, None)
    
    lines = text.split("\n")[:40]
    joined = " ".join(lines)
    
    # 1) Pattern "Curriculum Vitae di Nome Cognome"
    m = re.search(r"Curriculum\s+Vitae\s+di\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)", joined, re.I)
    if m:
        fn = m.group(1).capitalize()
        ln = m.group(2).capitalize()
        if is_valid_name(fn) and is_valid_name(ln):
            return (fn, ln)
    
    # 2) Pattern "Nome: X" + "Cognome: Y"
    fn_match = re.search(r"Nome[:\s]+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)", joined)
    ln_match = re.search(r"Cognome[:\s]+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)", joined)
    if fn_match and ln_match:
        fn = fn_match.group(1).capitalize()
        ln = ln_match.group(1).capitalize()
        if is_valid_name(fn) and is_valid_name(ln):
            return (fn, ln)
    
    # 3) Prima riga sola con NOME COGNOME maiuscolo
    for line in lines[:5]:
        line = line.strip()
        if not line or len(line) < 3:
            continue
        # Es: "TOMMASO SAMMACICCIA" o "Gianni PIATTI"
        m = re.match(r"^([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)$", line)
        if m:
            fn = m.group(1).capitalize()
            ln = m.group(2).capitalize()
            if is_valid_name(fn) and is_valid_name(ln):
                return (fn, ln)
    
    # 4) Pattern "C.v. _ Nome geom. COGNOME" (specifico per geometri)
    m = re.search(r"C\.?v\.?\s*[_\-]?\s*([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)\s+(?:geom\.?|Geom\.?|ing\.?|Ing\.?)?\s*([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)", joined, re.I)
    if m:
        fn = m.group(1).capitalize()
        ln = m.group(2).capitalize()
        if is_valid_name(fn) and is_valid_name(ln):
            return (fn, ln)
    
    return (None, None)


# === DB ===
def pg_connect():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    try:
        conn.set_client_encoding("UTF8")
    except Exception:
        pass
    return conn


def insert_import_event_newconn(
    status: str,
    message: str,
    candidateId: Optional[str] = None,
    cvFileId: Optional[str] = None,
):
    """Scrive sempre un import_event con connessione separata."""
    try:
        msg = _safe(message)
        c = pg_connect()
        try:
            c.autocommit = True
        except Exception:
            pass
        with c.cursor() as cur2:
            try:
                cur2.execute(
                    'INSERT INTO import_events (id,"createdAt",status,message,"candidateId","cvFileId") '
                    "VALUES (%s, now(), %s, %s, %s, %s)",
                    ("im_" + uuid.uuid4().hex[:24], status, msg, candidateId, cvFileId),
                )
            except Exception:
                cur2.execute(
                    'INSERT INTO import_events (id,"createdAt",status,message) '
                    "VALUES (%s, now(), %s, %s)",
                    ("im_" + uuid.uuid4().hex[:24], status, msg),
                )
        c.close()
    except Exception as e:
        print(f"[WARN] import_event(newconn) failed: {_safe(str(e))}", file=sys.stderr)


def upsert_import_job(path: str, source: str) -> str:
    c = pg_connect()
    c.autocommit = True
    job_id = "job_" + uuid.uuid4().hex[:24]
    with c.cursor() as cur:
        cur.execute(
            'INSERT INTO import_jobs (id,"createdAt","updatedAt",source,status,filename,path,message,attempts) '
            'VALUES (%s,now(),now(),%s,\'PROCESSING\',%s,%s,\'Analisi in corso\',1) '
            'ON CONFLICT (path) DO UPDATE SET status=\'PROCESSING\', "updatedAt"=now(), attempts=import_jobs.attempts+1, message=\'Analisi in corso\' '
            'RETURNING id',
            (job_id, source, os.path.basename(path), path),
        )
        job_id = cur.fetchone()[0]
    c.close()
    return job_id


def update_import_job(job_id: str, status: str, path: str, message: str, candidate_id: Optional[str] = None, threat: Optional[str] = None):
    try:
        c = pg_connect()
        c.autocommit = True
        with c.cursor() as cur:
            cur.execute(
                'UPDATE import_jobs SET status=%s,path=%s,message=%s,"candidateId"=%s,threat=%s,"updatedAt"=now() WHERE id=%s',
                (status, path, _safe(message), candidate_id, threat, job_id),
            )
        c.close()
    except Exception as error:
        print(f"[WARN] aggiornamento import job fallito: {_safe(str(error))}", file=sys.stderr)


# === PDF ===
def extract_text_pypdf(pdf_path: str) -> str:
    """Estrae testo con pypdf."""
    if not PdfReader:
        return ""
    try:
        r = PdfReader(pdf_path)
        chunks = []
        for pg in r.pages:
            try:
                chunks.append(pg.extract_text() or "")
            except Exception:
                pass
        return "\n".join(chunks)
    except Exception:
        return ""


def extract_text_pdfminer(pdf_path: str) -> str:
    """Estrae testo con pdfminer."""
    if not pdfminer_extract_text:
        return ""
    try:
        return pdfminer_extract_text(pdf_path) or ""
    except Exception:
        return ""


def extract_text_ocr(pdf_path: str, ocr_enabled: bool) -> str:
    """
    Estrae testo con OCR (tesseract).
    Richiede: tesseract-ocr, tesseract-ocr-ita, poppler-utils
    """
    if not OCR_AVAILABLE or not ocr_enabled:
        return ""
    
    try:
        print(f"[OCR] Avvio OCR per {pdf_path}", flush=True)
        images = convert_from_path(pdf_path, dpi=200)
        
        text_parts = []
        for i, img in enumerate(images):
            try:
                text = pytesseract.image_to_string(img, lang=OCR_LANG)
                text_parts.append(text)
            except Exception as e:
                print(f"[OCR] Errore pagina {i}: {e}", file=sys.stderr)
        
        return "\n".join(text_parts)
    except Exception as e:
        print(f"[OCR] Errore generale: {e}", file=sys.stderr)
        return ""


def extract_text_utf8(pdf_path: str, ocr_enabled: bool = False) -> str:
    """
    Estrae testo da PDF con fallback multipli:
    1. pypdf
    2. pdfminer
    3. OCR (se abilitato e testo vuoto)
    """
    txt = extract_text_pypdf(pdf_path)
    
    if not txt.strip():
        txt = extract_text_pdfminer(pdf_path)
    
    # Un PDF può contenere pochi caratteri tecnici ma essere in realtà una
    # scansione. In quel caso l'OCR è utile anche se il testo non è vuoto.
    compact = re.sub(r"\s+", "", txt or "")
    readable = sum(ch.isalnum() for ch in compact)
    low_quality = len(compact) < 140 or (len(compact) > 0 and readable / len(compact) < 0.55)
    if ocr_enabled and low_quality:
        ocr_text = extract_text_ocr(pdf_path, ocr_enabled)
        if len(ocr_text.strip()) > len((txt or "").strip()):
            txt = ocr_text
    
    try:
        return (txt or "").encode("utf-8", "replace").decode("utf-8")
    except Exception:
        return ""


# === Helpers principali ===
def file_sha1(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def move_to_processed(path: str) -> str:
    """Sposta il file in PROCESSED_DIR/AAAA-MM/filename.pdf. Ritorna nuovo path."""
    try:
        if not os.path.isfile(path):
            return path

        ts = os.path.getmtime(path)
        dt = datetime.datetime.fromtimestamp(ts)
        subdir = dt.strftime("%Y-%m")

        target_dir = os.path.join(PROCESSED_DIR, subdir)
        os.makedirs(target_dir, exist_ok=True)

        base = _sanitize_filename(os.path.basename(path))
        dest = os.path.join(target_dir, base)

        if os.path.exists(dest):
            root, ext = os.path.splitext(base)
            dest = os.path.join(target_dir, f"{root}__dup_{int(ts)}{ext}")

        os.rename(path, dest)
        print(f"[MOVE] {path} -> {dest}", flush=True)
        return dest
    except FileNotFoundError:
        return path
    except Exception as e:
        print(f"[WARN] move_to_processed({path}) failed: {_safe(str(e))}", file=sys.stderr)
        return path


def cleanup_error_files(days: int):
    cutoff = time.time() - max(1, days) * 86400
    for root, _, filenames in os.walk(ERROR_DIR):
        for filename in filenames:
            target = os.path.join(root, filename)
            try:
                if os.path.getmtime(target) < cutoff:
                    os.remove(target)
            except OSError as error:
                print(f"[WARN] pulizia errori fallita per {target}: {_safe(str(error))}", file=sys.stderr)
def get_next_submission_index(conn, first_name: str, last_name: str) -> int:
    """Restituisce il prossimo submissionIndex per questo nome+cognome."""
    with conn.cursor() as cur:
        cur.execute(
            '''
            SELECT COALESCE(MAX("submissionIndex"), 0) + 1
            FROM "candidates"
            WHERE lower("firstName") = lower(%s)
              AND lower("lastName")  = lower(%s)
            ''',
            (first_name, last_name),
        )
        (next_index,) = cur.fetchone()
    return int(next_index)


def ensure_candidate(cur, email, phone, fn, ln):
    """SEMPRE nuovo candidato. submissionIndex = progressivo per stesso nome+cognome."""
    # fallback da email se non abbiamo nome/cognome
    if (not fn or not ln) and email:
        f2, l2 = derive_names_from_email(email)
        fn = fn or f2
        ln = ln or l2

    fn = (fn or "N/D").strip() or "N/D"
    ln = (ln or "N/D").strip() or "N/D"

    def norm_email(e):
        e = (e or "").strip().lower()
        e = re.sub(r"\s+", "", e)
        return e or None

    def norm_phone(ph):
        ph = (ph or "").strip()
        ph = re.sub(r"\D+", "", ph)
        return ph or None

    email_norm = norm_email(email)
    phone_norm = norm_phone(phone)

    sub_idx = get_next_submission_index(cur.connection, fn, ln)

    cand_id = "cv_" + uuid.uuid4().hex[:24]
    cur.execute(
        'INSERT INTO candidates (id,"createdAt","updatedAt","firstName","lastName","email","emailNormalized","phone","phoneNormalized","submissionIndex") '
        'VALUES (%s, now(), now(), %s, %s, %s, %s, %s, %s, %s)',
        (cand_id, fn, ln, email, email_norm, phone, phone_norm, sub_idx),
    )
    return cand_id, int(sub_idx)


def insert_cv_file(cur, candidateId: str, path: str, size: int, sha1: str, source_key: str, text: str) -> str:
    nid = "cvf_" + uuid.uuid4().hex[:24]
    cur.execute(
        'INSERT INTO cv_files (id,"createdAt",path,size,sha1,"sourceKey","extractedText","candidateId") '
        "VALUES (%s, now(), %s, %s, %s, %s, %s, %s)",
        (nid, path, size, sha1, source_key, text, candidateId),
    )
    return nid


# === core ===
def process_one_file(conn, path: str, ocr_enabled: bool = False, source: str = "MANUAL"):
    print(f"[PROC] Inizio elaborazione: {path}", flush=True)
    job_id = upsert_import_job(path, source)
    cur = conn.cursor()
    try:
        try:
            conn.autocommit = False
        except Exception:
            pass

        cur.execute("SAVEPOINT onefile")

        st = os.stat(path)
        if st.st_size > 50 * 1024 * 1024:
            raise ValueError("PDF oltre il limite di 50 MB")
        scan_file(path)
        sha1 = file_sha1(path)
        source_key = hashlib.sha256(f"{os.path.realpath(path)}|{st.st_mtime_ns}|{st.st_size}".encode()).hexdigest()
        print(f"[PROC] sha1={sha1}", flush=True)

        cur.execute('SELECT id, "candidateId" FROM cv_files WHERE "sourceKey" = %s', (source_key,))
        previous = cur.fetchone()
        if previous:
            new_path = move_to_processed(path)
            cur.execute('UPDATE cv_files SET path=%s WHERE id=%s', (new_path, previous[0]))
            conn.commit()
            insert_import_event_newconn("DUPLICATE", f"Retry già acquisito: {os.path.basename(path)}", previous[1], previous[0])
            update_import_job(job_id, "DUPLICATE", new_path, "File già acquisito", previous[1])
            return

        text = extract_text_utf8(path, ocr_enabled)
        print(f"[PROC] estratto testo: {len(text)} caratteri", flush=True)

        email = pick_email(text)
        phone = pick_phone(text)

        fn: Optional[str] = None
        ln: Optional[str] = None

        # 1) Heuristic strutturata (pattern "Nome:", "Cognome:", "CV di X Y", ecc.)
        fn, ln = derive_names_from_text_heuristic(text)
        if fn and ln:
            print(f"[HEUR] Nome da testo strutturato: {fn} {ln}", flush=True)

        # 2) Fallback: dal filename
        if not fn or not ln:
            fn2, ln2 = derive_names_from_filename(path)
            if fn2 or ln2:
                fn = fn or fn2
                ln = ln or ln2
                print(f"[FILE] Nome da filename: {fn} {ln}", flush=True)

        # 3) Fallback: dall'email
        if not fn or not ln:
            fn3, ln3 = derive_names_from_email(email)
            if fn3 or ln3:
                fn = fn or fn3
                ln = ln or ln3
                print(f"[EMAIL] Nome da email: {fn} {ln}", flush=True)

        # 4) Ultima risorsa: NER spaCy (meno affidabile per CV italiani)
        if not fn or not ln:
            if NLP:
                fn4, ln4 = extract_names_ner(text)
                if fn4 or ln4:
                    fn = fn or fn4
                    ln = ln or ln4
                    print(f"[NER] Nome da spaCy: {fn} {ln}", flush=True)

        email = normalize_email(email)
        phone = normalize_phone(phone)

        print(f"[PROC] dati finali: fn={fn}, ln={ln}, email={email}, phone={phone}", flush=True)

        # Crea nuovo candidato
        cand_id, sub_idx = ensure_candidate(cur, email, phone, fn, ln)
        print(f"[CAND] creato candidato id={cand_id} name={fn or 'N/D'} {ln or 'N/D'} submissionIndex={sub_idx}", flush=True)

        # Nuovo CV
        cvf_id = insert_cv_file(cur, cand_id, path, st.st_size, sha1, source_key, text)
        print(f"[CVF] inserito cv_files id={cvf_id} size={st.st_size} sha1={sha1[:8]}...", flush=True)

        conn.commit()
        insert_import_event_newconn("SUCCESS", f"Inserito {os.path.basename(path)} sha1={sha1}", cand_id, cvf_id)

        # Sposta file
        try:
            new_path = move_to_processed(path)
            if new_path != path:
                cur.execute('UPDATE cv_files SET path=%s WHERE id=%s', (new_path, cvf_id))
                conn.commit()
            update_import_job(job_id, "SUCCESS", new_path, "Candidato creato correttamente", cand_id)
        except Exception as e:
            print(f"[WARN] move_to_processed failed: {_safe(str(e))}", file=sys.stderr)

        print(f"[OK] Elaborato {os.path.basename(path)} -> candidate={cand_id} submissionIndex={sub_idx}", flush=True)

    except Exception as e:
        try:
            cur.execute("ROLLBACK TO SAVEPOINT onefile")
        except Exception:
            pass
        conn.commit()
        err = traceback.format_exc()
        print(f"[ERR] Errore su file {path}: {_safe(str(e))}\n{err}", file=sys.stderr)
        insert_import_event_newconn("ERROR", f"{os.path.basename(path)}: {err}")
        destination = path
        try:
            if os.path.isfile(path):
                os.makedirs(ERROR_DIR, exist_ok=True)
                destination = os.path.join(ERROR_DIR, f"{int(time.time())}_{_sanitize_filename(os.path.basename(path))}")
                os.rename(path, destination)
                print(f"[QUARANTINE] {path} -> {destination}", file=sys.stderr)
        except Exception as quarantine_error:
            print(f"[WARN] quarantena fallita: {_safe(str(quarantine_error))}", file=sys.stderr)
        threat = _safe(str(e)) if "FOUND" in str(e) else None
        update_import_job(job_id, "BLOCKED" if threat else "ERROR", destination, str(e), threat=threat)
    finally:
        try:
            cur.close()
        except Exception:
            pass


def main():
    global WATCH_DIR, PROCESSED_DIR, ERROR_DIR
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL non impostata")
    print("[BOOT] Parser online; configurazione caricata dal database a ogni ciclo", flush=True)
    print(f"[BOOT] OCR_LANG={OCR_LANG}", flush=True)
    print(f"[BOOT] NER spaCy={'ON' if NLP else 'OFF'}", flush=True)
    
    conn = pg_connect()
    try:
        once = os.environ.get("ONCE") == "1"
        while True:
            config = load_config(DATABASE_URL)
            ensure_storage(config)
            PROCESSED_DIR = config["processedPath"]
            ERROR_DIR = config["errorPath"]
            cleanup_error_files(int(config.get("errorRetentionDays", 30)))
            input_dirs = [(config["mailInboxPath"], "EMAIL"), (config["manualInboxPath"], "MANUAL")]
            print(f"[CONFIG] input={input_dirs} processed={PROCESSED_DIR}", flush=True)
            ocr_enabled = bool(config["ocrEnabled"])
            print(f"[CONFIG] OCR abilitato: {ocr_enabled}", flush=True)
            
            try:
                pdfs = sorted({
                    (os.path.join(root, filename), source)
                    for input_dir, source in input_dirs
                    for root, _, filenames in os.walk(input_dir)
                    for filename in filenames
                    if filename.lower().endswith(".pdf")
                })
            except FileNotFoundError:
                print(f"[ERR] WATCH_DIR {WATCH_DIR} non esiste", file=sys.stderr, flush=True)
                return

            print(f"[SCAN] trovati {len(pdfs)} pdf", flush=True)
            for p, source in pdfs:
                print(f"[DEBUG] trovo file: {p}", flush=True)
                process_one_file(conn, p, ocr_enabled, source)

            if once:
                break

            time.sleep(max(5, int(config["parserPollSeconds"])))
    finally:
        try:
            conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
