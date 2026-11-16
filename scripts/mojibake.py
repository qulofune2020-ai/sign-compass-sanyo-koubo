"""文字にした資料のうち、日本語として読める文字の割合を出す（文字化けの検出）"""
import sys, re, pathlib
ok = re.compile(r"[　-ヿ一-鿿＀-￯0-9A-Za-z\s\.,:;()\-－。、・「」（）％%／/~～]")
for f in sys.argv[1:]:
    t = re.sub(r"=====p\d+=====", "", pathlib.Path(f).read_text(encoding="utf-8"))
    t = "".join(t.split())
    if not t: print(f"  空   {pathlib.Path(f).stem}"); continue
    r = sum(1 for c in t if ok.match(c)) / len(t)
    print(f"{r*100:5.1f}% {pathlib.Path(f).stem}")
