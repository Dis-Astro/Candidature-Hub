import os
import sys
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()
