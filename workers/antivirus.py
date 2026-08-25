import os
import socket
import struct


class AntivirusUnavailable(RuntimeError):
    pass


class ThreatDetected(RuntimeError):
    pass


def scan_bytes(data: bytes, source: str = "file") -> None:
    if os.environ.get("ANTIVIRUS_REQUIRED", "1") == "0":
        return
    host = os.environ.get("CLAMAV_HOST", "clamav")
    port = int(os.environ.get("CLAMAV_PORT", "3310"))
    try:
        with socket.create_connection((host, port), timeout=15) as sock:
            sock.settimeout(30)
            sock.sendall(b"zINSTREAM\0")
            for offset in range(0, len(data), 1024 * 1024):
                chunk = data[offset:offset + 1024 * 1024]
                sock.sendall(struct.pack("!I", len(chunk)) + chunk)
            sock.sendall(struct.pack("!I", 0))
            response = b""
            while not response.endswith(b"\0"):
                part = sock.recv(4096)
                if not part:
                    break
                response += part
    except (OSError, socket.timeout) as error:
        raise AntivirusUnavailable(f"Antivirus non disponibile per {source}: {error}") from error
    result = response.rstrip(b"\0").decode("utf-8", "replace")
    if result.endswith(" OK"):
        return
    if result.endswith(" FOUND"):
        raise ThreatDetected(result)
    raise AntivirusUnavailable(f"Risposta antivirus non valida per {source}: {result or 'vuota'}")


def scan_file(path: str) -> None:
    with open(path, "rb") as handle:
        scan_bytes(handle.read(), os.path.basename(path))
