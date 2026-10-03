# ストア用スクリーンショット 1 を作る。
# x.com の Before / After の画面（Retina のウィンドウキャプチャ）から会話の欄を切り出し、
# @handle にモザイクをかけて 1280x800 に並べる。
# 使い方: python3 store/compose.py <before.png> <after.png> store/screenshot-1.png
#
# 座標はすべて元画像のピクセル位置。撮り直したら CROP / MOSAIC / HIDDEN_ROW を合わせ直す。
import sys
from PIL import Image, ImageDraw, ImageFont

# 会話の欄（左右の境界線の内側から、返信欄の下の境界線まで）
CROP = {
    "before": (797, 75, 1877, 860),
    "after": (797, 73, 1877, 698),
}
# @handle の @ より後ろ
MOSAIC = {
    "before": [(996, 104, 1098, 142), (996, 263, 1123, 301), (921, 456, 1023, 494)],
    "after": [(996, 102, 1098, 140), (921, 296, 1023, 330)],
}
# Before で隠れる返信の行（上端と下端の y）
HIDDEN_ROW = (250, 400)

PANEL_W = 540
W, H = 1280, 800
BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
REGULAR = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"


def pixelate(img, box, block=8):
    region = img.crop(box)
    small = region.resize((max(1, region.width // block), max(1, region.height // block)), Image.BILINEAR)
    img.paste(small.resize(region.size, Image.NEAREST), box)


def panel(path, key):
    img = Image.open(path).convert("RGB")
    for box in MOSAIC[key]:
        pixelate(img, box)
    crop = img.crop(CROP[key])
    scale = PANEL_W / crop.width
    return crop.resize((PANEL_W, round(crop.height * scale)), Image.LANCZOS), scale, img.getpixel((CROP[key][0] + 10, CROP[key][3] - 10))


before, scale, bg = panel(sys.argv[1], "before")
after, _, _ = panel(sys.argv[2], "after")
out = sys.argv[3]

# X のテーマ（ライト / ダーク）に合わせて文字と枠線の色を変える
light = sum(bg) / 3 > 128
fg = (15, 20, 25) if light else (231, 233, 234)
muted = (83, 100, 113) if light else (139, 152, 165)
border = (207, 217, 222) if light else (47, 51, 54)
amber = (230, 140, 0) if light else (255, 173, 31)
accent = (29, 155, 240)

canvas = Image.new("RGB", (W, H), bg)
d = ImageDraw.Draw(canvas)
d.text((W / 2, 96), "他人宛てのリプライだけを、静かに隠す", font=ImageFont.truetype(BOLD, 40), fill=fg, anchor="mm")
d.text((W / 2, 148), "登録したユーザーが他人に書いたリプライを非表示に。会話は点線でつながったまま。",
       font=ImageFont.truetype(REGULAR, 22), fill=muted, anchor="mm")

top = 250
xl, xr = 60, W - 60 - PANEL_W
label = ImageFont.truetype(BOLD, 24)
for x, img, text, color in ((xl, before, "Before", muted), (xr, after, "After", accent)):
    d.text((x, top - 26), text, font=label, fill=color, anchor="lm")
    canvas.paste(img, (x, top))
    d.rounded_rectangle((x - 1, top - 1, x + img.width, top + img.height), radius=10, outline=border, width=2)

# Before で隠れる返信を枠で囲む
y0 = top + round((HIDDEN_ROW[0] - CROP["before"][1]) * scale)
y1 = top + round((HIDDEN_ROW[1] - CROP["before"][1]) * scale)
d.rounded_rectangle((xl + 4, y0, xl + PANEL_W - 4, y1), radius=8, outline=amber, width=3)
d.text((xl + PANEL_W - 66, y0 + 12), "これを隠す", font=ImageFont.truetype(BOLD, 18), fill=amber, anchor="rt")

# 矢印
cx, cy = W / 2, top + after.height / 2
d.line((cx - 24, cy, cx + 14, cy), fill=accent, width=5)
d.polygon([(cx + 24, cy), (cx + 8, cy - 13), (cx + 8, cy + 13)], fill=accent)

canvas.save(out)
