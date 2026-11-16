"""画像だけ・文字化けのPDFを OCR（tesseract、日本語）で文字にする（手元だけ。資料/txt/<id>.ocr.txt）。
ページごとに =====pN===== で区切る（N は物理ページ）。
OCR の文字は読み違いを含むので、照合では「一致（OCR）」などと区別し、人が原本の画像と見比べる前提で使う。
使い方: python3 -I scripts/ocr.py 資料/<id>.pdf ...
"""
import sys, pathlib, subprocess, tempfile, warnings
warnings.filterwarnings("ignore")
import pymupdf

for src in sys.argv[1:]:
    p = pathlib.Path(src)
    out = p.parent / "txt" / (p.stem + ".ocr.txt")
    chunks = []
    with pymupdf.open(src) as d, tempfile.TemporaryDirectory() as tmp:
        for i, page in enumerate(d, start=1):
            png = pathlib.Path(tmp) / f"{i}.png"
            page.get_pixmap(dpi=300).save(png)
            r = subprocess.run(["tesseract", str(png), "-", "-l", "jpn", "--psm", "3"], capture_output=True, text=True)
            chunks.append(f"=====p{i}=====\n{r.stdout.rstrip()}\n")
    out.write_text("".join(chunks), encoding="utf-8")
    print(f"{len(chunks):4d}頁 {out.name}", flush=True)
