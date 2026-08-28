import os, re, time, hashlib, email, traceback, smtplib, ssl, html, socket, ipaddress, json
from urllib.parse import urljoin, urlsplit, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from datetime import datetime, timedelta, date
from email.header import decode_header, make_header
from email.policy import default as default_policy
from email.mime.text import MIMEText

from imapclient import IMAPClient, SEEN, DELETED
from bs4 import BeautifulSoup
from xhtml2pdf import pisa
from dotenv import dotenv_values
from workers.runtime_config import ensure_storage, load_config
from workers.antivirus import scan_bytes

# ---------- Config ----------
CFG = dotenv_values("/opt/mail2pdf/.env")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
MAIL_ENABLED = False
IMAP_HOST    = CFG.get("IMAP_HOST","")
IMAP_PORT    = int(CFG.get("IMAP_PORT","993"))
IMAP_USER    = CFG.get("IMAP_USER","")
IMAP_PASS    = CFG.get("IMAP_PASS","")
IMAP_MAILBOX = CFG.get("IMAP_MAILBOX","INBOX")
SAVE_DIR     = CFG.get("SAVE_DIR", "/data/inbox/mail")
POLL_SECONDS = int(CFG.get("POLL_SECONDS","60"))

# Post processing
POST_ACTION    = (CFG.get("POST_ACTION","none") or "none").lower()   # move|delete|none
MOVE_FOLDER_BN = CFG.get("MOVE_FOLDER","Processed")  # base name (senza 'INBOX.')
RETENTION_DAYS = int(CFG.get("RETENTION_DAYS","0") or 0)
MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
MAX_PDF_LINKS = 10
MAX_REDIRECTS = 5

# Alert email
ALERT_TO   = CFG.get("ALERT_TO","")
SMTP_HOST  = CFG.get("SMTP_HOST","")
SMTP_PORT  = int(CFG.get("SMTP_PORT","0") or 0)
SMTP_USER  = CFG.get("SMTP_USER","")
SMTP_PASS  = CFG.get("SMTP_PASS","")

# rate limit alert: max 1 ogni 15 minuti
ALERT_INTERVAL_SECONDS = 15 * 60
_last_alert_ts = 0
_last_cleanup_ts = 0  # per retention

def refresh_config():
    """Reload operational settings so email/storage changes require no redeploy."""
    global MAIL_ENABLED, IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, IMAP_MAILBOX
    global SAVE_DIR, POLL_SECONDS, POST_ACTION, MOVE_FOLDER_BN, RETENTION_DAYS
    global ALERT_TO, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    if not DATABASE_URL:
        return
    config = load_config(DATABASE_URL)
    ensure_storage(config)
    MAIL_ENABLED = bool(config.get("mailEnabled"))
    IMAP_HOST = config.get("imapHost", "")
    IMAP_PORT = int(config.get("imapPort", 993))
    IMAP_USER = config.get("imapUser", "")
    IMAP_PASS = config.get("imapPass", "")
    IMAP_MAILBOX = config.get("imapMailbox", "INBOX")
    SAVE_DIR = config["mailInboxPath"]
    POLL_SECONDS = max(15, int(config.get("pollSeconds", 60)))
    POST_ACTION = str(config.get("postAction", "move")).lower()
    MOVE_FOLDER_BN = config.get("moveFolder", "Processed")
    RETENTION_DAYS = int(config.get("mailRetentionDays", 90))
    ALERT_TO = config.get("alertTo", "")
    SMTP_HOST = config.get("smtpHost", "")
    SMTP_PORT = int(config.get("smtpPort", 587))
    SMTP_USER = config.get("smtpUser", "")
    SMTP_PASS = config.get("smtpPass", "")
    os.makedirs(SAVE_DIR, exist_ok=True)

def send_alert(subject: str, body: str):
    global _last_alert_ts
    now = time.time()
    if not (ALERT_TO and SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASS):
        return
    if now - _last_alert_ts < ALERT_INTERVAL_SECONDS:
        return
    _last_alert_ts = now
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = SMTP_USER
        msg["To"] = ALERT_TO

        if SMTP_PORT == 465:  # SMTPS
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context) as s:
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        else:  # STARTTLS
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.ehlo(); s.starttls(context=ssl.create_default_context()); s.ehlo()
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
    except Exception:
        traceback.print_exc()

# ---------- Utility ----------
def sanitize_filename(s, maxlen=180):
    s = re.sub(r'[\\/:*?"<>|]+', "_", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:maxlen] if len(s) > maxlen else s

def decode_str(v):
    try:
        return str(make_header(decode_header(v))) if v else ""
    except Exception:
        return v or ""

def msg_unique_key(msg):
    mid = msg.get("Message-ID") or ""
    if mid:
        return hashlib.sha1(mid.encode("utf-8","ignore")).hexdigest()[:16]
    blob = (msg.get("Date","")+msg.get("From","")+msg.get("Subject","")).encode("utf-8","ignore")
    return hashlib.sha1(blob).hexdigest()[:16]

def html_to_pdf(html, dest):
    with open(dest,"wb") as f:
        res = pisa.CreatePDF(html, dest=f)
        return not res.err

def write_mail_context(base, msg, plain_text, html_body, cv_paths):
    """Conserva la mail come documento e collega in modo atomico i CV acquisiti."""
    if not cv_paths:
        return None

    mail_document = os.path.join(SAVE_DIR, f"{base}.maildoc")
    if not html_to_pdf(build_mail_pdf_html(msg, plain_text, html_body), mail_document):
        raise ValueError("Impossibile generare il PDF della mail originale")

    body_text = plain_text or BeautifulSoup(html_body or "", "html.parser").get_text("\n", strip=True)
    context = {
        "version": 1,
        "messageKey": msg_unique_key(msg),
        "subject": decode_str(msg.get("Subject", "")),
        "bodyText": body_text[:200000],
        "emailDocument": mail_document,
        "cvFiles": [os.path.basename(path) for path in cv_paths],
    }
    context_path = os.path.join(SAVE_DIR, f"{base}.mail.json")
    temporary = context_path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as stream:
        json.dump(context, stream, ensure_ascii=False)
    os.replace(temporary, context_path)
    return context_path

def clean_html(html_body: str) -> str:
    """Sanifica HTML e rimuove IMG cid: che xhtml2pdf non gestisce."""
    soup = BeautifulSoup(html_body or "", "html.parser")
    for tag in soup(["script","style"]):
        tag.decompose()
    for img in soup.find_all("img"):
        img.decompose()
    for anchor in soup.find_all("a"):
        href = html.unescape(str(anchor.get("href", ""))).strip()
        try:
            parsed = urlsplit(href)
        except ValueError:
            parsed = None
        if not parsed or parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            anchor.attrs.pop("href", None)
            continue
        if href not in anchor.get_text(" ", strip=True):
            anchor.append(f" ({href})")
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith("on") or attr.lower() in {"style", "src", "srcset"}:
                del tag.attrs[attr]
    return str(soup)

def build_mail_pdf_html(msg, plain_text="", html_body=""):
    subj = html.escape(sanitize_filename(decode_str(msg.get("Subject",""))))
    from_ = html.escape(decode_str(msg.get("From",""))); to_ = html.escape(decode_str(msg.get("To","")))
    cc_ = html.escape(decode_str(msg.get("Cc",""))); date_ = html.escape(decode_str(msg.get("Date","")))
    if not html_body:
        safe = (plain_text or "").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\n","<br/>")
        html_body = f"<div style='font-family:Helvetica,Arial,sans-serif;font-size:12pt;'>{safe}</div>"
    else:
        html_body = clean_html(html_body)
    return f"""<html><head><meta charset="utf-8"/><style>
    body{{font-family:Helvetica,Arial,sans-serif}}
    .header{{border-bottom:1px solid #444;margin-bottom:12px;padding-bottom:8px}}
    .row{{margin:2px 0}} .label{{color:#666;width:80px;display:inline-block}} h1{{font-size:18px;margin:0 0 6px}}
    </style></head><body>
    <div class="header"><h1>{subj or "(senza oggetto)"}</h1>
    <div class="row"><span class="label">Da:</span> {from_}</div>
    <div class="row"><span class="label">A:</span> {to_}</div>
    {f"<div class='row'><span class='label'>Cc:</span> {cc_}</div>" if cc_ else ""}
    <div class="row"><span class="label">Data:</span> {date_}</div></div>
    {html_body}
    </body></html>"""

def pick_bodies(msg):
    html_body=""; plain_text=""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_disposition()=="attachment":
                continue
            ctype = part.get_content_type()
            try:
                payload = part.get_content()
            except Exception:
                payload = part.get_payload(decode=True)
                if isinstance(payload, bytes):
                    payload = payload.decode(part.get_content_charset() or "utf-8","replace")
            if ctype=="text/html" and not html_body:
                html_body = payload or ""
            elif ctype=="text/plain" and not plain_text:
                plain_text = payload or ""
    else:
        ctype = msg.get_content_type()
        payload = msg.get_content()
        if ctype=="text/html":
            html_body = payload or ""
        else:
            plain_text = payload or ""
    return plain_text, html_body

def extract_pdf_links(plain_text="", html_body=""):
    """Estrae link HTTPS diretti a PDF dal testo e dagli href della mail."""
    candidates = []
    if html_body:
        soup = BeautifulSoup(html_body, "html.parser")
        candidates.extend(tag.get("href", "") for tag in soup.find_all("a", href=True))
    candidates.extend(re.findall(r"https?://[^\s<>\"']+", plain_text or "", flags=re.IGNORECASE))

    links = []
    seen = set()
    for raw in candidates:
        url = html.unescape(str(raw)).strip().rstrip(").,;]}")
        try:
            parsed = urlsplit(url)
        except ValueError:
            continue
        if parsed.scheme.lower() != "https" or not parsed.hostname or parsed.username or parsed.password:
            continue
        if not unquote(parsed.path).lower().endswith(".pdf"):
            continue
        normalized = parsed.geturl()
        if normalized not in seen:
            seen.add(normalized)
            links.append(normalized)
        if len(links) >= MAX_PDF_LINKS:
            break
    return links

def validate_public_pdf_url(url):
    """Blocca URL non HTTPS e destinazioni locali/private per evitare richieste interne."""
    parsed = urlsplit(url)
    if parsed.scheme.lower() != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Il collegamento PDF deve usare HTTPS e non contenere credenziali")
    if parsed.port not in (None, 443):
        raise ValueError("Porta del collegamento PDF non consentita")
    if not unquote(parsed.path).lower().endswith(".pdf"):
        raise ValueError("Il collegamento non punta direttamente a un PDF")
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses:
        raise ValueError("Dominio del collegamento non risolvibile")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("Destinazione locale o privata non consentita")
    return url

class SafePdfRedirectHandler(HTTPRedirectHandler):
    def __init__(self):
        super().__init__()
        self.redirects = 0

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.redirects += 1
        if self.redirects > MAX_REDIRECTS:
            raise ValueError("Troppi reindirizzamenti nel collegamento PDF")
        safe_url = validate_public_pdf_url(urljoin(req.full_url, newurl))
        return super().redirect_request(req, fp, code, msg, headers, safe_url)

def download_linked_pdf(url, base_prefix, index):
    """Scarica un PDF pubblico, lo valida, lo analizza e lo salva nella coda email."""
    safe_url = validate_public_pdf_url(url)
    request = Request(
        safe_url,
        headers={"User-Agent": "Candidature-Hub/1.0", "Accept": "application/pdf"},
    )
    opener = build_opener(SafePdfRedirectHandler())
    with opener.open(request, timeout=20) as response:
        final_url = validate_public_pdf_url(response.geturl())
        declared_size = int(response.headers.get("Content-Length", "0") or 0)
        if declared_size > MAX_ATTACHMENT_SIZE:
            raise ValueError("PDF collegato oltre 25 MB")
        payload = response.read(MAX_ATTACHMENT_SIZE + 1)
    if len(payload) > MAX_ATTACHMENT_SIZE:
        raise ValueError("PDF collegato oltre 25 MB")
    if not payload.startswith(b"%PDF-"):
        raise ValueError("Il collegamento non ha restituito un PDF valido")

    scan_bytes(payload, final_url)
    remote_name = sanitize_filename(unquote(os.path.basename(urlsplit(final_url).path))) or "curriculum.pdf"
    if not remote_name.lower().endswith(".pdf"):
        remote_name += ".pdf"
    out = os.path.join(SAVE_DIR, f"{base_prefix}__link_{index:02d}__{remote_name}")
    with open(out, "xb") as dest:
        dest.write(payload)
    return out

def save_pdf_attachment(part, base_prefix):
    fname = part.get_filename() or "allegato.pdf"
    try:
        fname = str(make_header(decode_header(fname)))
    except Exception:
        pass
    fname = sanitize_filename(fname)
    out = os.path.join(SAVE_DIR, f"{base_prefix}__{fname}")
    payload = part.get_payload(decode=True) or b""
    if len(payload) > MAX_ATTACHMENT_SIZE:
        raise ValueError(f"Allegato PDF oltre 25 MB: {fname}")
    if not payload.startswith(b"%PDF-"):
        raise ValueError(f"Allegato dichiarato PDF ma non valido: {fname}")
    scan_bytes(payload, fname)
    with open(out,"wb") as f:
        f.write(payload)
    return out

# ---------- Folder helpers ----------
def _get_delimiter(srv: IMAPClient) -> str:
    # prendi un delimiter valido dalla LIST
    try:
        for flags, delim, name in srv.list_folders():
            if delim:
                return (delim.decode() if isinstance(delim, bytes) else delim)
    except Exception:
        pass
    return "/"  # fallback

def inbox_child(srv: IMAPClient, child: str) -> str:
    delim = _get_delimiter(srv)
    child = child.strip().lstrip("/. ")
    return f"INBOX{delim}{child}" if not child.upper().startswith("INBOX") else child

def ensure_folder(srv: IMAPClient, folder: str):
    try:
        folders = [f[-1].decode() if isinstance(f[-1], bytes) else f[-1] for f in srv.list_folders()]
        if folder not in folders:
            srv.create_folder(folder)
    except Exception:
        pass  # ok se esiste già o non si può creare

# ---------- Post-processing ----------
def move_or_delete(srv: IMAPClient, uid):
    if POST_ACTION == "none":
        return
    if POST_ACTION == "move":
        try:
            dest = inbox_child(srv, MOVE_FOLDER_BN)
            ensure_folder(srv, dest)
            try:
                srv.move(uid, dest)  # se supporta MOVE
                return
            except Exception:
                srv.copy(uid, dest)
                srv.add_flags(uid, [DELETED])
                srv.expunge()
                return
        except Exception:
            traceback.print_exc()
            return
    if POST_ACTION == "delete":
        try:
            srv.add_flags(uid, [DELETED])
            srv.expunge()
        except Exception:
            traceback.print_exc()

def retention_cleanup(srv: IMAPClient):
    """Elimina messaggi più vecchi di N giorni in INBOX/<MOVE_FOLDER_BN> (se abilitato)."""
    global _last_cleanup_ts
    if not (POST_ACTION == "move" and RETENTION_DAYS > 0):
        return
    if time.time() - _last_cleanup_ts < 6*3600:  # non più spesso di ogni 6h
        return
    _last_cleanup_ts = time.time()
    original = IMAP_MAILBOX
    dest = inbox_child(srv, MOVE_FOLDER_BN)
    try:
        ensure_folder(srv, dest)
        srv.select_folder(dest)
        cutoff = date.today() - timedelta(days=RETENTION_DAYS)
        ids = srv.search(['BEFORE', cutoff])
        if ids:
            srv.add_flags(ids, [DELETED])
            srv.expunge()
    except Exception:
        traceback.print_exc()
    finally:
        try:
            srv.select_folder(original)
        except Exception:
            pass

# ---------- Core ----------
def process_unseen_once():
    saved=[]
    if not MAIL_ENABLED:
        return saved
    with IMAPClient(IMAP_HOST, port=IMAP_PORT, ssl=True) as srv:
        srv.login(IMAP_USER, IMAP_PASS)
        srv.select_folder(IMAP_MAILBOX)
        retention_cleanup(srv)  # opzionale
        ids = srv.search(["UNSEEN"])
        if not ids:
            return saved
        data = srv.fetch(ids, ["RFC822"])
        for uid, blob in data.items():
            queue_lock = None
            try:
                msg = email.message_from_bytes(blob[b"RFC822"], policy=default_policy)
                subject = sanitize_filename(decode_str(msg.get("Subject",""))) or "senza_oggetto"
                dt = datetime.now().strftime("%Y%m%d_%H%M%S")
                key = msg_unique_key(msg)
                state_dir = os.path.join(SAVE_DIR, ".mail-state")
                os.makedirs(state_dir, exist_ok=True)
                marker = os.path.join(state_dir, key)
                if os.path.exists(marker):
                    srv.add_flags(uid, [SEEN])
                    move_or_delete(srv, uid)
                    continue
                base = f"{dt}__{key}__{subject}"
                queue_lock = os.path.join(SAVE_DIR, f"{base}.mail-lock")
                with open(queue_lock, "w", encoding="ascii") as lock_stream:
                    lock_stream.write(str(uid))

                pdf_found=False
                message_pdfs=[]
                if msg.is_multipart():
                    for part in msg.iter_attachments():
                        fn = part.get_filename()
                        if not fn:
                            continue
                        if part.get_content_type()=="application/pdf" or fn.lower().endswith(".pdf"):
                            saved_path = save_pdf_attachment(part, base)
                            saved.append(saved_path)
                            message_pdfs.append(saved_path)
                            pdf_found=True

                plain, html_body = pick_bodies(msg)
                for index, link in enumerate(extract_pdf_links(plain, html_body), start=1):
                    try:
                        saved_path = download_linked_pdf(link, base, index)
                        saved.append(saved_path)
                        message_pdfs.append(saved_path)
                        pdf_found=True
                        print(f"PDF scaricato dal collegamento: {urlsplit(link).hostname}")
                    except Exception as link_error:
                        print(f"[WARN] Collegamento PDF ignorato: {link_error}", flush=True)

                if pdf_found:
                    write_mail_context(base, msg, plain, html_body, message_pdfs)
                else:
                    out = os.path.join(SAVE_DIR, f"{base}.pdf")
                    if html_to_pdf(build_mail_pdf_html(msg, plain, html_body), out):
                        saved.append(out)
                    else:
                        eml = os.path.join(SAVE_DIR, f"{base}.eml")
                        with open(eml,"wb") as f:
                            f.write(blob[b"RFC822"])
                        saved.append(eml)

                os.remove(queue_lock)
                queue_lock = None

                # marca letto + sposta/cancella
                try:
                    srv.add_flags(uid, [SEEN])
                except Exception:
                    traceback.print_exc()
                move_or_delete(srv, uid)
                with open(marker, "w", encoding="ascii") as state:
                    state.write(str(uid))

            except Exception as e:
                if queue_lock:
                    try:
                        os.remove(queue_lock)
                    except OSError:
                        pass
                send_alert(
                    "[mail2pdf] Errore elaborazione messaggio",
                    f"{datetime.now()} - Errore: {e}\n\n{traceback.format_exc()}"
                )
                traceback.print_exc()
                continue
    return saved

def main():
    refresh_config()
    print(f"[{datetime.now()}] Monitor IMAP {IMAP_HOST}/{IMAP_MAILBOX} → {SAVE_DIR} "
          f"(post={POST_ACTION}{'->'+MOVE_FOLDER_BN if POST_ACTION=='move' else ''}; retention={RETENTION_DAYS}d)")
    interval = max(POLL_SECONDS, 15)
    while True:
        try:
            refresh_config()
            if not MAIL_ENABLED:
                print("Acquisizione email disabilitata; attendo configurazione.")
                time.sleep(max(POLL_SECONDS, 15))
                continue
            out = process_unseen_once()
            if out:
                for p in out:
                    print("Salvato:", p)
            else:
                print("Nessun nuovo messaggio da elaborare.")
        except Exception as e:
            send_alert(
                "[mail2pdf] Errore ciclo principale",
                f"{datetime.now()} - Errore: {e}\n\n{traceback.format_exc()}"
            )
            traceback.print_exc()
        time.sleep(interval)

if __name__ == "__main__":
    main()
