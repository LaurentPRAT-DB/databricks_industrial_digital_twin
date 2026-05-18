#!/usr/bin/env python3
"""
Post-deploy health check for Industrial Digital Twin.

Validates the app is running and Lakebase is connected.
Exit code 0 = healthy, 1 = unhealthy.

Usage:
    python scripts/health_check.py
    python scripts/health_check.py --url https://industrial-digital-twin-dev.aws.databricksapps.com
    python scripts/health_check.py --json
"""

import argparse
import json
import sys
import time

import httpx


def check_health(base_url: str, retries: int = 12, interval: float = 5.0) -> dict:
    """Hit /health with retries until success or timeout."""
    last_error = None

    for attempt in range(1, retries + 1):
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(f"{base_url}/health")

            if resp.status_code == 200:
                return {"healthy": True, "data": resp.json(), "attempts": attempt}
            else:
                last_error = f"HTTP {resp.status_code}"
        except Exception as e:
            last_error = str(e)

        if attempt < retries:
            time.sleep(interval)

    return {"healthy": False, "error": last_error, "attempts": retries}


def main():
    parser = argparse.ArgumentParser(description="Health check for Industrial Digital Twin")
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Base URL of the application (default: http://localhost:8000)"
    )
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--retries", type=int, default=12, help="Number of retries (default: 12)")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between retries")
    args = parser.parse_args()

    result = check_health(args.url, retries=args.retries, interval=args.interval)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if result["healthy"]:
            data = result["data"]
            lb = data.get("lakebase", {})
            print(f"  Status: {data.get('status', 'unknown')}")
            print(f"  Lakebase: {'connected' if lb.get('connected') else 'disconnected'}")
            if lb.get("latency_ms"):
                print(f"  Latency: {lb['latency_ms']}ms")
            if data.get("build_number"):
                print(f"  Build: {data['build_number']}")
            print(f"  (checked in {result['attempts']} attempt(s))")

            if not lb.get("connected"):
                print("\n  WARNING: App is running but Lakebase is not connected.")
                print("  What-ifs and reports will not persist.")
                sys.exit(1)
        else:
            print(f"  FAILED after {result['attempts']} attempts: {result.get('error')}")
            sys.exit(1)


if __name__ == "__main__":
    main()
