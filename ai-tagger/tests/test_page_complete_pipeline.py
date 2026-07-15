from __future__ import annotations

import pathlib
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import extractors  # noqa: E402
import pipeline  # noqa: E402
import structured_openai  # noqa: E402


def native_fixture(page_count: int, weak_pages: set[int]):
    units = []
    pages = []
    for page_number in range(1, page_count + 1):
        text = "" if page_number in weak_pages else f"Native page {page_number} " * 12
        pages.append(
            {
                "pageNumber": page_number,
                "text": text.strip(),
                "charCount": len(text.strip()),
            }
        )
        unit = extractors._unit(
            text,
            {"kind": "page", "pageNumber": page_number},
            source="pdfminer",
            ocr_used=False,
        )
        if unit:
            units.append(unit)
    return units, page_count, pages


class PageCompletePipelineTests(unittest.TestCase):
    def test_mixed_pdf_ocrs_only_weak_pages_and_preserves_order(self) -> None:
        native = native_fixture(5, {2, 5})

        def fake_ocr(_data, *, options, page_count):
            selected = [int(value) for value in str(options["pages"]).split(",")]
            return {
                "engine": "test-ocr",
                "fallbackUsed": False,
                "options": options,
                "errors": [],
                "pages": [
                    {
                        "pageNumber": number,
                        "text": f"OCR recovered page {number} " * 8,
                        "engine": "test-ocr",
                        "isBlank": False,
                        "isWeak": False,
                    }
                    for number in selected
                ],
            }

        with (
            mock.patch.object(extractors, "_extract_pdf_native", return_value=native),
            mock.patch.object(extractors, "ocr_pdf_bytes", side_effect=fake_ocr) as ocr,
        ):
            result = extractors._from_pdf_bytes_bundle(
                b"%PDF-test",
                ocr_options={"enabled": True},
            )

        coverage = result["extraction"]["coverage"]
        self.assertTrue(coverage["complete"])
        self.assertEqual(coverage["totalPages"], 5)
        self.assertEqual(coverage["nativePages"], 3)
        self.assertEqual(coverage["ocrPages"], 2)
        self.assertEqual(ocr.call_count, 1)
        self.assertEqual(
            [unit["locator"]["pageNumber"] for unit in result["groundingUnits"]],
            [1, 2, 3, 4, 5],
        )

    def test_large_scanned_pdf_is_ocr_batched_automatically(self) -> None:
        native = native_fixture(45, set(range(1, 46)))

        def fake_ocr(_data, *, options, page_count):
            selected = [int(value) for value in str(options["pages"]).split(",")]
            return {
                "engine": "test-ocr",
                "fallbackUsed": False,
                "options": options,
                "errors": [],
                "pages": [
                    {
                        "pageNumber": number,
                        "text": f"Recovered complete OCR content for page {number}. " * 5,
                        "engine": "test-ocr",
                        "isBlank": False,
                        "isWeak": False,
                    }
                    for number in selected
                ],
            }

        with (
            mock.patch.object(extractors, "_extract_pdf_native", return_value=native),
            mock.patch.object(extractors, "ocr_pdf_bytes", side_effect=fake_ocr) as ocr,
        ):
            result = extractors._from_pdf_bytes_bundle(
                b"%PDF-test",
                ocr_options={"enabled": True},
            )

        self.assertEqual(ocr.call_count, 3)
        self.assertTrue(result["extraction"]["coverage"]["complete"])
        self.assertEqual(result["extraction"]["coverage"]["ocrPages"], 45)

    def test_map_windows_account_for_last_page(self) -> None:
        units = [
            {
                "text": f"Content for page {page} " * 20,
                "locator": {"kind": "page", "pageNumber": page},
            }
            for page in range(1, 101)
        ]
        units[-1]["text"] += "Final page signal Gurugram"
        windows = structured_openai._map_windows(
            "",
            units,
            max_chars=1400,
        )
        combined = "\n".join(str(window["text"]) for window in windows)
        self.assertIn("[page 100]", combined)
        self.assertIn("Final page signal Gurugram", combined)

    def test_general_candidates_cover_final_window(self) -> None:
        units = [
            {
                "text": f"Routine policy content page {page}.",
                "locator": {"kind": "page", "pageNumber": page},
            }
            for page in range(1, 101)
        ]
        units[-1]["text"] += " RareFinalProgramme"
        content = "\n\n".join(unit["text"] for unit in units)
        bundle = {
            "text": content,
            "extraction": {"kind": "pdf", "unitCount": 100},
            "groundingUnits": units,
        }

        def fake_candidates(text, topn=20):
            return ["RareFinalProgramme"] if "RareFinalProgramme" in text else []

        with (
            mock.patch.object(pipeline, "_load_content_bundle", return_value=bundle),
            mock.patch.object(pipeline, "generate_candidates", side_effect=fake_candidates),
        ):
            result = pipeline.extract_and_tag_sync(topk=20, use_llm=False, text="x")

        self.assertIn("rarefinalprogramme", {tag.casefold() for tag in result["tags"]})


if __name__ == "__main__":
    unittest.main()
