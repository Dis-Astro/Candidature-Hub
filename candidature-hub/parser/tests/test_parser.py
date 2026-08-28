import os
import sys
import tempfile
import unittest
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import parser


class ParserTests(unittest.TestCase):
    def test_structured_name(self):
        self.assertEqual(parser.derive_names_from_text_heuristic("Curriculum Vitae di Mario Rossi\nEsperienza"), ("Mario", "Rossi"))

    def test_email_and_phone(self):
        text = "Contatti: mario.rossi@example.org, tel. +39 333 123 4567"
        self.assertEqual(parser.pick_email(text), "mario.rossi@example.org")
        self.assertEqual(parser.pick_phone(text), "+393331234567")

    def test_filename(self):
        self.assertEqual(parser.derive_names_from_filename("/tmp/CV_Mario_Rossi.pdf"), ("Mario", "Rossi"))

    def test_sanitized_filename_is_pdf(self):
        self.assertEqual(parser._sanitize_filename("../../Currìculum Rossi"), ".._.._Curriculum Rossi.pdf")

    def test_loads_mail_context_for_the_linked_cv(self):
        with tempfile.TemporaryDirectory() as directory:
            cv_path = os.path.join(directory, "message__link_01__cv.pdf")
            open(cv_path, "wb").close()
            manifest = {
                "messageKey": "abc",
                "emailDocument": os.path.join(directory, "message.maildoc"),
                "cvFiles": [os.path.basename(cv_path)],
            }
            with open(os.path.join(directory, "message.mail.json"), "w", encoding="utf-8") as stream:
                json.dump(manifest, stream)
            loaded = parser.load_mail_context(cv_path)
            self.assertEqual(loaded["messageKey"], "abc")
            self.assertTrue(loaded["manifestPath"].endswith("message.mail.json"))

    def test_waits_until_mail_worker_releases_the_message(self):
        with tempfile.TemporaryDirectory() as directory:
            cv_path = os.path.join(directory, "message__link_01__cv.pdf")
            open(cv_path, "wb").close()
            lock_path = os.path.join(directory, "message.mail-lock")
            open(lock_path, "w").close()
            self.assertFalse(parser.mail_file_is_ready(cv_path))
            os.remove(lock_path)
            self.assertTrue(parser.mail_file_is_ready(cv_path))


if __name__ == "__main__":
    unittest.main()
