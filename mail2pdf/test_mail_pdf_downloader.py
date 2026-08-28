import unittest
from unittest.mock import patch

from mail_pdf_downloader import build_mail_pdf_html, clean_html, extract_pdf_links, validate_public_pdf_url


class PdfLinkExtractionTests(unittest.TestCase):
    def test_extracts_pdf_href_and_plain_url_without_duplicates(self):
        url = "https://www.example.it/uploads/CV%20Mario.pdf"
        html = f'<p><a href="{url}">Scarica curriculum</a></p>'
        plain = f"Curriculum: {url}"
        self.assertEqual(extract_pdf_links(plain, html), [url])

    def test_rejects_http_credentials_and_non_pdf_links(self):
        plain = " ".join([
            "http://example.it/cv.pdf",
            "https://user:pass@example.it/cv.pdf",
            "https://example.it/curriculum",
        ])
        self.assertEqual(extract_pdf_links(plain, ""), [])

    def test_accepts_pdf_with_query_string(self):
        url = "https://example.it/moduli/candidato.pdf?download=1"
        self.assertEqual(extract_pdf_links(url, ""), [url])

    def test_printed_mail_contains_full_safe_link(self):
        url = "https://example.it/cv.pdf"
        cleaned = clean_html(f'<a href="{url}">Scarica curriculum</a>')
        self.assertIn(url, cleaned)
        self.assertIn('href="https://', cleaned)

    def test_printed_mail_removes_unsafe_link(self):
        cleaned = clean_html('<a href="javascript:alert(1)">Apri</a>')
        self.assertNotIn("javascript:", cleaned)

    def test_mail_document_keeps_the_link_visible(self):
        from email.message import EmailMessage
        msg = EmailMessage()
        msg["Subject"] = "Candidatura"
        url = "https://example.it/cv.pdf"
        rendered = build_mail_pdf_html(msg, "", f'<a href="{url}">Curriculum</a>')
        self.assertIn(url, rendered)

    @patch("mail_pdf_downloader.socket.getaddrinfo")
    def test_blocks_private_network_destinations(self, resolve):
        resolve.return_value = [(2, 1, 6, "", ("192.168.1.20", 443))]
        with self.assertRaisesRegex(ValueError, "privata"):
            validate_public_pdf_url("https://nas.local/cv.pdf")

    @patch("mail_pdf_downloader.socket.getaddrinfo")
    def test_accepts_public_https_destination(self, resolve):
        resolve.return_value = [(2, 1, 6, "", ("93.184.216.34", 443))]
        url = "https://example.it/cv.pdf"
        self.assertEqual(validate_public_pdf_url(url), url)


if __name__ == "__main__":
    unittest.main()
