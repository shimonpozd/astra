import json
import unittest

from brain.research import _parse_curator_response
from brain.main import _build_research_context_message


class ParseCuratorResponseTests(unittest.TestCase):
    def test_respects_limit_and_category(self):
        links = [
            {"ref": "Commentary Ref", "category": "Commentary", "commentator": "Rashi"},
            {"ref": "Midrash Ref", "category": "Midrash", "commentator": "Midrash"},
            {"ref": "Excluded Ref", "category": "Commentary", "commentator": "Other"},
        ]
        raw = json.dumps({
            "selected_refs": [
                {"ref": "Commentary Ref", "category": "Commentary"},
                {"ref": "Midrash Ref", "category": "Midrash"},
                {"ref": "Excluded Ref", "category": "Commentary"},
            ]
        })

        result = _parse_curator_response(
            raw=raw,
            original_links=links,
            allowed_set={"Commentary", "Midrash"},
            limit=2,
        )

        refs = [item["ref"] for item in result]
        self.assertEqual(refs, ["Commentary Ref", "Midrash Ref"])

    def test_handles_category_buckets(self):
        links = [
            {"ref": "Ref A", "category": "Commentary", "commentator": "Rashi"},
            {"ref": "Ref B", "category": "Midrash", "commentator": "Bereishit Rabbah"},
        ]
        raw = json.dumps({
            "Commentary": ["Ref A"],
            "Midrash": [{"ref": "Ref B"}],
        })

        result = _parse_curator_response(
            raw=raw,
            original_links=links,
            allowed_set={"Commentary", "Midrash"},
            limit=5,
        )

        refs = {item["ref"] for item in result}
        self.assertEqual(refs, {"Ref A", "Ref B"})


class BuildResearchContextMessageTests(unittest.TestCase):
    def test_includes_plan_and_sources(self):
        plan = {
            "focus": "Why water is not called good on day two",
            "guiding_questions": ["What do commentators say?"],
            "outline": ["Problem statement", "Classical answers"],
            "external_sources": ["https://example.com/article"],
        }
        research_info = {
            "research_depth": 25,
            "sources": [
                {
                    "role": "primary",
                    "ref": "Genesis 1:9",
                    "categories": ["Bible"],
                    "commentaries": [
                        {
                            "commentator": "Rashi",
                            "category": "Commentary",
                            "ref": "Rashi on Genesis 1:9:1",
                            "chunks": [],
                            "text": "",
                        }
                    ],
                },
                {
                    "role": "supporting",
                    "ref": "Midrash Rabbah Genesis 5:6",
                    "categories": ["Midrash"],
                    "commentaries": [],
                },
            ],
        }

        message = _build_research_context_message(plan, research_info)

        self.assertIn("Research focus: Why water is not called good on day two", message)
        self.assertIn("Guiding questions:", message)
        self.assertIn("1. What do commentators say?", message)
        self.assertIn("Outline for the drasha:", message)
        self.assertIn("1. Problem statement", message)
        self.assertIn("Primary texts:", message)
        self.assertIn("Genesis 1:9", message)
        self.assertIn("Selected commentaries", message)
        self.assertIn("Rashi", message)
        self.assertIn("External references to consult:", message)
        self.assertIn("https://example.com/article", message)

    def test_empty_when_no_info(self):
        self.assertEqual(_build_research_context_message({}, None), "")


if __name__ == "__main__":
    unittest.main()
