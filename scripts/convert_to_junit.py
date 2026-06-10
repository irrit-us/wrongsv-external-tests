#!/usr/bin/env python3
"""
Convert Flutter's `flutter test --machine` JSON-Lines output to JUnit XML.

Usage:
  flutter test --machine | python convert_to_junit.py --output results/junit.xml
  python convert_to_junit.py --input unit_tests.jsonl --output results/junit.xml

JUnit XML is consumed by CI tools (Jenkins, GitHub Actions test reporter, GitLab).
"""

import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def parse_flutter_machine_output(lines: list[str]) -> list[dict]:
    """Parse `flutter test --machine` JSON-Lines into structured test results."""
    results: list[dict] = []
    test_starts: dict[int, dict] = {}

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        event_type = event.get("type")

        if event_type == "testStart":
            test_id = event["test"]["id"]
            test_starts[test_id] = {
                "suiteName": event["test"].get("suiteName", "default"),
                "testName": event["test"].get("name", "unknown"),
                "startTime": event.get("time", int(time.time() * 1000)),
            }

        elif event_type == "testDone":
            test_id = event["testID"]
            start_info = test_starts.pop(test_id, {})
            suite_name = start_info.get("suiteName", event.get("suiteName", "default"))

            results.append({
                "suiteName": suite_name,
                "testName": start_info.get("testName", event.get("testName", "unknown")),
                "result": event.get("result", "error"),
                "durationMs": event.get("time", 0),
                "failureMessage": event.get("failure", ""),
                "error": event.get("error", ""),
                "skipped": event.get("skipped", False),
            })

    return results


def build_junit_xml(results: list[dict], suite_name: str = "flutter_tests") -> ET.Element:
    """Build a JUnit XML ElementTree from test results."""
    # Group by suite
    suites: dict[str, list[dict]] = {}
    for r in results:
        sn = r.get("suiteName", suite_name)
        suites.setdefault(sn, []).append(r)

    root = ET.Element("testsuites", name=suite_name)
    total_all = len(results)
    failures_all = sum(1 for r in results if r["result"] != "success")
    errors_all = sum(1 for r in results if r["result"] == "error")
    skipped_all = sum(1 for r in results if r.get("skipped"))
    total_time = sum(r.get("durationMs", 0) for r in results) / 1000.0

    root.set("tests", str(total_all))
    root.set("failures", str(failures_all))
    root.set("errors", str(errors_all))
    root.set("skipped", str(skipped_all))
    root.set("time", f"{total_time:.3f}")

    for sn, suite_results in suites.items():
        total = len(suite_results)
        failed = sum(1 for r in suite_results if r["result"] != "success")
        errored = sum(1 for r in suite_results if r["result"] == "error")
        skipped = sum(1 for r in suite_results if r.get("skipped"))
        suite_time = sum(r.get("durationMs", 0) for r in suite_results) / 1000.0

        suite_el = ET.SubElement(root, "testsuite", {
            "name": sn,
            "tests": str(total),
            "failures": str(failed),
            "errors": str(errored),
            "skipped": str(skipped),
            "time": f"{suite_time:.3f}",
        })

        for r in suite_results:
            tc = ET.SubElement(suite_el, "testcase", {
                "name": r["testName"],
                "classname": r["suiteName"],
                "time": f"{r.get('durationMs', 0) / 1000.0:.3f}",
            })

            if r.get("skipped"):
                ET.SubElement(tc, "skipped", message="Test skipped")

            if r["result"] == "error":
                ET.SubElement(tc, "error", {
                    "message": r.get("error", "Unknown error"),
                    "type": "TestError",
                })

            elif r["result"] != "success":
                ET.SubElement(tc, "failure", {
                    "message": r.get("failureMessage", "Test failed"),
                    "type": "TestFailure",
                })

    return root


def main():
    parser = argparse.ArgumentParser(
        description="Convert Flutter test --machine output to JUnit XML"
    )
    parser.add_argument("--input", "-i", type=Path,
                        help="JSON-Lines input file (reads stdin if omitted)")
    parser.add_argument("--output", "-o", type=Path, required=True,
                        help="JUnit XML output file")
    parser.add_argument("--suite-name", default="flutter_tests",
                        help="Root testsuite name (default: flutter_tests)")

    args = parser.parse_args()

    # Read input
    if args.input:
        with open(args.input) as f:
            lines = f.readlines()
    else:
        lines = sys.stdin.readlines()

    # Parse and convert
    results = parse_flutter_machine_output(lines)
    if not results:
        print("Warning: No test results found in input", file=sys.stderr)

    junit_tree = build_junit_xml(results, args.suite_name)

    # Write output
    xml_string = ET.tostring(junit_tree, encoding="unicode", xml_declaration=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        f.write(xml_string)

    # Summary
    passed = sum(1 for r in results if r["result"] == "success")
    failed = sum(1 for r in results if r["result"] not in ("success", "error") and not r.get("skipped"))
    print(f"Converted {len(results)} tests → {args.output}")
    print(f"  Passed: {passed}, Failed: {failed}", file=sys.stderr)

    return 1 if failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
