import json
from pathlib import Path
import requests
import time

URL = "https://gutendex.com/books/"
OUT = Path(__file__).resolve().parents[1] / "data" / "magazines.json"

def fetch_rows(target_count: int = 150) -> list[dict]:
    items = []
    # 使用英文 (languages=en) 获取，这样全是现代英文著作，没有文言文，同时完美契合沉浸式翻译插件
    next_url = f"{URL}?topic=history&languages=en"
    
    print("Fetching online data from Project Gutenberg (English History)...")
    while next_url and len(items) < target_count:
        print(f"Requesting: {next_url}")
        r = requests.get(next_url, timeout=30)
        r.raise_for_status()
        data = r.json()
        
        results = data.get("results", [])
        for d in results:
            ident = str(d.get("id"))
            title = d.get("title", "Unknown")
            authors = [a.get("name") for a in d.get("authors", []) if a.get("name")]
            subjects = d.get("subjects", [])
            
            description = f"Author(s): {', '.join(authors)}" if authors else "No author info"
            
            # 提取 EPUB 格式用于分章在线阅读
            formats = d.get("formats", {})
            epub_url = formats.get("application/epub+zip")
            html_url = formats.get("text/html") or formats.get("text/html; charset=utf-8")
            
            # 优先使用 EPUB，如果没有再降级到 HTML
            read_url = epub_url if epub_url else html_url
            if not read_url:
                read_url = f"https://www.gutenberg.org/ebooks/{ident}"
                
            items.append({
                "identifier": ident,
                "title": title,
                "year": "N/A",
                "subject": subjects[:10],
                "description": description,
                "url": read_url,
                "isEpub": bool(epub_url)
            })
            if len(items) >= target_count:
                break
                
        next_url = data.get("next")
        if next_url:
            time.sleep(1) # 防止请求过快被限制
        
    return items

def main() -> None:
    items = fetch_rows(150)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "source": "Project Gutenberg (English History)",
                "query": "topic: history, languages: en",
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
