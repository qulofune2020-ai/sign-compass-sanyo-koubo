"""資料を文字にする（手元だけ。資料/txt/ は .gitignore 済み）。
手本 yomidokoro（MIT）の to_text.py と同じ方式：PDF はページごとに =====pN===== で区切る（N は物理ページ）。
HTML は本文の文字だけにして =====p1===== とする。
使い方: python3 -I scripts/to_text.py <資料/のファイル>...
"""
import html, re, sys, unicodedata, pathlib, warnings
warnings.filterwarnings("ignore")

def pdf(src):
    import pymupdf
    with pymupdf.open(src) as d:
        return [(i, p.get_text("text")) for i, p in enumerate(d, start=1)]

def page(src):
    s = pathlib.Path(src).read_text(encoding="utf-8", errors="replace")
    s = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", "", s)
    s = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|td|th|dt|dd)>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    s = "\n".join(l.strip() for l in s.splitlines() if l.strip())
    return [(1, s)]

for src in sys.argv[1:]:
    p = pathlib.Path(src)
    pages = pdf(src) if p.suffix == ".pdf" else page(src)
    out = p.parent / "txt" / (p.stem + ".txt")
    out.parent.mkdir(exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for n, t in pages:
            f.write(f"=====p{n}=====\n" + unicodedata.normalize("NFC", t).rstrip() + "\n")
    print(f"{len(pages):4d}頁 {out.name}")
