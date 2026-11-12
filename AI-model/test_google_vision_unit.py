"""Offline tests: python -m unittest test_google_vision_unit -v"""
import io
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from PIL import Image
from google.api_core import exceptions as errors
from google_vision_ocr import extract_text, validate_image


def png_bytes():
    out = io.BytesIO()
    Image.new("RGB", (12, 12), "white").save(out, format="PNG")
    return out.getvalue()


def response(text="hello", message="", code=0):
    return SimpleNamespace(
        error=SimpleNamespace(message=message, code=code),
        full_text_annotation=SimpleNamespace(text=text),
    )


class OCRTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(extract_text(b"")["error"], "INVALID_IMAGE")

    def test_wrong_type(self):
        self.assertEqual(extract_text("not bytes")["error"], "INVALID_IMAGE")

    def test_pdf(self):
        self.assertEqual(extract_text(b"%PDF-1.4 fake")["error"], "UNSUPPORTED_FORMAT")

    def test_broken_image(self):
        self.assertEqual(extract_text(png_bytes()[:35])["error"], "INVALID_IMAGE")

    def test_large(self):
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, {"OCR_MAX_IMAGE_BYTES": "10"}):
            self.assertEqual(validate_image(png_bytes()), "IMAGE_TOO_LARGE")

    def test_success(self):
        client = Mock()
        client.document_text_detection.return_value = response(" 고양이\n ")
        self.assertEqual(extract_text(png_bytes(), client=client),
                         {"success": True, "rawText": "고양이", "error": None})
        self.assertEqual(client.document_text_detection.call_args.kwargs["timeout"], 60)

    def test_no_text(self):
        client = Mock()
        client.document_text_detection.return_value = response("")
        self.assertEqual(extract_text(png_bytes(), client=client)["error"], "NO_TEXT_DETECTED")

    def test_provider_auth_response(self):
        client = Mock()
        client.document_text_detection.return_value = response(message="forbidden", code=7)
        self.assertEqual(extract_text(png_bytes(), client=client)["error"], "OCR_AUTH_ERROR")

    def test_provider_rate_response(self):
        client = Mock()
        client.document_text_detection.return_value = response(message="quota", code=8)
        self.assertEqual(extract_text(png_bytes(), client=client)["error"], "OCR_RATE_LIMIT")

    def test_auth_exception(self):
        client = Mock()
        client.document_text_detection.side_effect = errors.PermissionDenied("secret")
        self.assertEqual(extract_text(png_bytes(), client=client)["error"], "OCR_AUTH_ERROR")

    def test_timeout(self):
        client = Mock()
        client.document_text_detection.side_effect = errors.DeadlineExceeded("timeout")
        self.assertEqual(extract_text(png_bytes(), client=client)["error"], "OCR_TIMEOUT")

    def test_rate_limit(self):
        client = Mock()
        client.document_text_detection.side_effect = errors.ResourceExhausted("quota")
        self.assertEqual(extract_text(png_bytes(), client=client)["error"], "OCR_RATE_LIMIT")

    def test_other_error(self):
        client = Mock()
        client.document_text_detection.side_effect = RuntimeError("sensitive error")
        self.assertEqual(extract_text(png_bytes(), client=client),
                         {"success": False, "rawText": None, "error": "OCR_SERVICE_ERROR"})


if __name__ == "__main__":
    unittest.main()
