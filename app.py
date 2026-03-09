"""Legacy entrypoint.

This repository is now static-first.
Use `python scripts/fetch_magazines.py` to refresh data,
then serve files via `python -m http.server 8080`.
"""

if __name__ == "__main__":
    print("Static site mode. Run: python scripts/fetch_magazines.py")
