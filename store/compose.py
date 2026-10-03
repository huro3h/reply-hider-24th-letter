# ストア用スクリーンショットを作る。
# x.com の会話部分を Retina で撮った Before / After の画像から、@handle にモザイクをかけて
# 1280x800 に左右に並べる。
# 使い方: python3 store/compose.py <before.png> <after.png> store/screenshot-1.png
#
# 座標はすべて元画像のピクセル位置。撮り直したら CROP / MOSAIC / HIDDEN_ROW を合わせ直す。
# 最初の投稿が左右で同じ高さに来るように切り出す。
import sys
from PIL import Image, ImageDraw, ImageFont

CROP = {
    "before": (0, 0, 1306, 688),  # 右端の区切り線を落とす
    "after": (4, 87, 1310, 575),  # 上の「← ポスト」の見出しと、下の区切り線を落とす
}
# @handle の @ より後ろ
MOSAIC = {
    "before": [(238, 40, 362, 80), (238, 234, 392, 274), (145, 466, 270, 504)],
    "after": [(242, 126, 366, 166), (149, 360, 274, 398)],
}
# Before で隠れる返信の行（上端と下端の y）
HIDDEN_ROW = (222, 402)

W, H = 1280, 800
MARGIN, GAP = 28, 64  # 左右の余白と、パネルの間（矢印を置く）
LABEL_SPACE = 52
BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"


def pixelate(img, box, block=8):
    region = img.crop(box)
    small = region.resize((max(1, region.width // block), max(1, region.height // block)), Image.BILINEAR)
    img.paste(small.resize(region.size, Image.NEAREST), box)


def panel(path, key, scale):
    img = Image.open(path).convert("RGB")
    for box in MOSAIC[key]:
        pixelate(img, box)
    crop = img.crop(CROP[key])
    return crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)


panel_w = (W - MARGIN * 2 - GAP) // 2
scale = panel_w / (CROP["before"][2] - CROP["before"][0])
before = panel(sys.argv[1], "before", scale)
after = panel(sys.argv[2], "after", scale)
out = sys.argv[3]

bg = before.getpixel((before.width - 4, before.height - 4))
# X のテーマ（ライト / ダーク）に合わせて色を変える
light = sum(bg) / 3 > 128
muted = (83, 100, 113) if light else (139, 152, 165)
border = (207, 217, 222) if light else (47, 51, 54)
amber = (230, 140, 0) if light else (255, 173, 31)
accent = (29, 155, 240)

canvas = Image.new("RGB", (W, H), bg)
d = ImageDraw.Draw(canvas)

# 見出しと高いほうのパネル（Before）を合わせた塊を、上下の中央に置く
top = (H - (LABEL_SPACE + before.height)) // 2 + LABEL_SPACE
xl = MARGIN
xr = W - MARGIN - panel_w
label = ImageFont.truetype(BOLD, 30)
for x, img, text, color in ((xl, before, "Before", muted), (xr, after, "After", accent)):
    d.text((x, top - 34), text, font=label, fill=color, anchor="lm")
    canvas.paste(img, (x, top))
    d.rounded_rectangle((x - 1, top - 1, x + img.width, top + img.height), radius=12, outline=border, width=2)

# Before で隠れる返信を枠で囲む
y0 = top + round((HIDDEN_ROW[0] - CROP["before"][1]) * scale)
y1 = top + round((HIDDEN_ROW[1] - CROP["before"][1]) * scale)
d.rounded_rectangle((xl + 3, y0, xl + panel_w - 3, y1), radius=10, outline=amber, width=3)

# 矢印（パネルの間、After の高さの中央）
cx, cy = W / 2, top + after.height / 2
d.line((cx - 20, cy, cx + 10, cy), fill=accent, width=5)
d.polygon([(cx + 20, cy), (cx + 5, cy - 12), (cx + 5, cy + 12)], fill=accent)

canvas.save(out)
