"""PDFの1ページあたりの文字数（空白を除く）を出す。画像だけのPDFを見つけるため"""
import sys, fitz
for f in sys.argv[1:]:
    with fitz.open(f) as d:
        n = [len("".join(p.get_text("text").split())) for p in d]
    print(f"{sum(n)//max(1,len(n)):6d} 字/頁  空のページ {sum(1 for x in n if x<30):3d}/{len(n):3d}  {f.split('/')[-1]}")
