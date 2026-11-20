"""Generate the repository's fictional demo images with Pillow."""

from pathlib import Path
from random import Random

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SIZE = (1024, 680)
PALETTES = (
    ((39, 74, 98), (229, 190, 155), (24, 63, 74), (235, 209, 152)),
    ((43, 75, 82), (191, 201, 170), (43, 103, 103), (237, 186, 127)),
    ((71, 58, 90), (223, 165, 142), (67, 69, 108), (247, 198, 156)),
    ((66, 81, 96), (194, 209, 194), (48, 85, 106), (213, 159, 125)),
)
SUBJECTS = ("coast",) * 7 + ("street",) * 3 + ("indoor", "mountain")


def blend(start, end, weight):
    return tuple(round(a + (b - a) * weight) for a, b in zip(start, end))


def draw_hills(draw, rng, base, color):
    ridge = [(x, base - rng.randrange(20, 145)) for x in range(0, 1089, 64)]
    draw.polygon(ridge + [(1088, SIZE[1]), (0, SIZE[1])], fill=color)


def render(index, subject):
    rng = Random(index)
    sky, horizon, shade, accent = PALETTES[(index - 1) % len(PALETTES)]
    width, height = SIZE
    image = Image.new("RGB", SIZE)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        draw.line((0, y, width, y), fill=blend(sky, horizon, min(1, y / 390)))

    sun_x = rng.randrange(140, 880)
    draw.ellipse((sun_x - 44, 126, sun_x + 44, 214), fill=accent)
    for _ in range(22):
        x, y = rng.randrange(-80, width), rng.randrange(65, 310)
        draw.line((x, y, x + rng.randrange(28, 180), y), fill=blend(horizon, sky, 0.28))

    if subject == "coast":
        draw.rectangle((0, 348, width, height), fill=shade)
        for _ in range(235):
            x, y = rng.randrange(width), rng.randrange(351, height)
            glint = blend(shade, accent, rng.uniform(0.1, 0.65))
            draw.line((x, y, x + rng.randrange(8, 92), y), fill=glint, width=2)
        offset = rng.randrange(30, 145)
        draw.polygon([(0, 490), (188, 434), (370 + offset, 574), (570, height), (0, height)], fill=(36, 46, 50))
        draw.polygon([(690, 602), (855, 513), (width, 536), (width, height), (601, height)], fill=(48, 57, 55))
        draw.rectangle((147 + offset, 340, 173 + offset, 456), fill=(241, 229, 196))
        draw.rectangle((142 + offset, 353, 178 + offset, 370), fill=accent)
        draw.polygon([(137 + offset, 343), (160 + offset, 318), (183 + offset, 343)], fill=(118, 52, 48))
    elif subject == "street":
        draw.rectangle((0, 358, width, height), fill=shade)
        draw.polygon([(431, 395), (570, 395), (881, height), (116, height)], fill=blend(sky, shade, 0.55))
        for x, roof, floor, building_width in [(0, 175, 517, 219), (204, 236, 455, 208), (608, 249, 477, 193), (786, 141, 542, 238)]:
            draw.rectangle((x, roof, x + building_width, floor), fill=blend(sky, shade, rng.uniform(0.2, 0.7)))
            for y in range(roof + 28, floor - 34, 53):
                for column in range(x + 23, x + building_width - 26, 41):
                    draw.rectangle((column, y, column + 15, y + 25), fill=blend(shade, accent, rng.uniform(0.3, 0.9)))
        for _ in range(75):
            y = rng.randrange(505, height)
            x = rng.randrange(300, 760)
            draw.line((x, y, x + rng.randrange(12, 60), y), fill=blend(shade, accent, rng.uniform(0.1, 0.57)))
    elif subject == "indoor":
        draw.rectangle((0, 0, width, height), fill=(65, 51, 49))
        draw.rectangle((178, 63, 846, 486), fill=horizon)
        draw.ellipse((570, 144, 676, 250), fill=accent)
        draw.polygon([(178, 388), (355, 258), (468, 382), (650, 291), (846, 399), (846, 486), (178, 486)], fill=shade)
        draw.rectangle((502, 62, 520, 485), fill=(65, 51, 49))
        draw.rectangle((178, 319, 846, 332), fill=(65, 51, 49))
        draw.ellipse((222, 497, 804, 805), fill=(137, 91, 65))
        draw.ellipse((459, 498, 576, 578), fill=(236, 221, 189))
        draw.ellipse((472, 507, 561, 553), fill=(93, 65, 54))
    else:
        for base, weight in ((386, 0.24), (472, 0.46), (578, 0.66), (647, 0.85)):
            draw_hills(draw, rng, base, blend(horizon, shade, weight))
        draw.polygon([(551, 570), (584, 578), (679, height), (493, height)], fill=blend(shade, accent, 0.45))

    return image


def save(image, relative_path):
    destination = ROOT / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="JPEG", quality=88, optimize=True)


def main():
    for index, subject in enumerate(SUBJECTS, 1):
        save(render(index, subject), f"tests/fixtures/synthetic/sample-{index:02}-{subject}.jpg")
    save(render(2, "coast"), "tests/fixtures/smoke/synthetic-smoke-1024.jpg")
    save(render(1, "coast"), "prototypes/three/assets/synthetic-coast.jpg")


if __name__ == "__main__":
    main()
