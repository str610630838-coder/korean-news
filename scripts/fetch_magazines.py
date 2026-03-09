from __future__ import annotations

import json
from pathlib import Path

import requests

QUERY = 'mediatype:texts AND (subject:"history" OR title:"history") AND collection:magazine_rack'
URL = "https://archive.org/advancedsearch.php"
OUT = Path(__file__).resolve().parents[1] / "data" / "magazines.json"


def fetch_rows(rows: int = 200) -> list[dict]:
    params = {
        "q": QUERY,
        "fl[]": ["identifier", "title", "year", "description", "subject"],
        "rows": rows,
        "page": 1,
        "output": "json",
        "sort[]": "year asc",
    }
    r = requests.get(URL, params=params, timeout=30)
    r.raise_for_status()
    docs = r.json().get("response", {}).get("docs", [])

    items = []
    for d in docs:
        ident = d.get("identifier")
        if not ident:
            continue
        subject = d.get("subject") or []
        if isinstance(subject, str):
            subject = [subject]

        description = d.get("description")
        if isinstance(description, list):
            description = " ".join(str(x) for x in description)
        description = (description or "").strip()

        items.append(
            {
                "identifier": ident,
                "title": d.get("title") or ident,
                "year": str(d.get("year") or ""),
                "subject": subject[:10],
                "description": description[:400],
                "url": f"https://archive.org/details/{ident}",
            }
        )
    return items


def main() -> None:
    items = fetch_rows()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "source": "Internet Archive advancedsearch",
                "query": QUERY,
                "count": len(items),
                "items": items,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"done: {len(items)} -> {OUT}")


if __name__ == "__main__":
    main()
