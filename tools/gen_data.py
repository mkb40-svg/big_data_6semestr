# -*- coding: utf-8 -*-
"""Генератор учебных наборов данных для тренажёра.

Запуск из корня репозитория:   python tools/gen_data.py
Все данные вымышленные и создаются детерминированно (random.seed).
Для sales.xlsx нужен пакет openpyxl (pip install openpyxl).
"""
import csv, json, os, random, re, math, html
from datetime import datetime, timedelta, date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from corpus_source import ARTICLES, CYRILLIC, STOPWORDS

OKINA, TUTUQ = "ʻ", "ʼ"
VARIANTS = {
    "canonical": (OKINA, TUTUQ),
    "ascii": ("'", "'"),
    "typographic": ("‘", "’"),
    "backtick": ("`", "'"),
}


def apostrophes(text, variant):
    ok, tu = VARIANTS[variant]
    text = re.sub(r"([oOgG])'", lambda m: m.group(1) + ok, text)
    return text.replace("'", tu)


def w(path, text):
    full = os.path.join(DATA, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def wcsv(path, header, rows):
    full = os.path.join(DATA, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="") as f:
        cw = csv.writer(f)
        cw.writerow(header)
        cw.writerows(rows)


def wjson(path, obj, indent=2):
    w(path, json.dumps(obj, ensure_ascii=False, indent=indent) + "\n")


R = random.Random(2026)

MALE = ["Aziz", "Bobur", "Doniyor", "Eldor", "Farrux", "Jasur", "Javohir", "Kamron", "Laziz", "Nodir",
        "Otabek", "Rustam", "Sardor", "Shoxrux", "Temur", "Ulug'bek", "Zafar", "Islom", "Behruz", "Sanjar"]
FEMALE = ["Aziza", "Dilnoza", "Gulnora", "Kamola", "Laylo", "Madina", "Malika", "Nilufar", "Nodira", "Ozoda",
          "Sevara", "Shahnoza", "Umida", "Zarina", "Mohira", "Feruza", "Sabina", "Dildora", "Munisa", "Hilola"]
LAST = ["Abdullayev", "Karimov", "Rahimov", "Toshmatov", "Yusupov", "Ergashev", "Nazarov", "Sobirov", "Qodirov",
        "Ismoilov", "Xolmatov", "Murodov", "Hasanov", "Aliyev", "Tursunov", "Mirzayev", "Saidov", "Usmonov"]
CITIES = ["Toshkent", "Samarqand", "Buxoro", "Andijon", "Farg'ona", "Namangan", "Qarshi", "Nukus", "Urganch",
          "Jizzax", "Termiz", "Navoiy"]
CITY_W = [30, 10, 8, 8, 8, 7, 6, 5, 5, 4, 4, 5]
FACULTIES = {"Kompyuter lingvistikasi": "KL", "Tarjimonlik": "TR", "Filologiya": "FL", "Xalqaro jurnalistika": "XJ"}


def person():
    g = R.choice("MF")
    first = R.choice(MALE if g == "M" else FEMALE)
    last = R.choice(LAST) + ("" if g == "M" else "a")
    return g, first, last


# ---------------------------------------------------------------- students
def gen_students():
    rows = []
    for i in range(1, 201):
        g, first, last = person()
        fac = R.choice(list(FACULTIES))
        course = R.choice([1, 2, 3, 3, 4])
        by = 2026 - (17 + course) - R.choice([0, 0, 1, 1, 2])
        age = 2026 - by
        group = f"{FACULTIES[fac]}-{course}0{R.randint(1, 3)}"
        city = R.choices(CITIES, CITY_W)[0]
        gpa = round(min(5.0, max(2.6, R.gauss(4.0, 0.5))), 2)
        att = round(min(100, max(55, R.gauss(88, 9))), 1)
        eng = R.choices(["A2", "B1", "B2", "C1"], [2, 4, 3, 1])[0]
        rows.append([f"S{i:04d}", f"{last} {first}", g, by, age, fac, group, course, city, gpa, att, eng])
    header = ["student_id", "full_name", "gender", "birth_year", "age", "faculty", "group", "course", "city", "gpa",
              "attendance", "english_level"]
    wcsv("students.csv", header, rows)
    return header, rows


def gen_students_dirty(header, rows):
    out = []
    city_variants = {"Toshkent": ["Toshkent", "toshkent", " Toshkent ", "TOSHKENT", "Tashkent", "Toshkent sh."],
                     "Samarqand": ["Samarqand", "samarqand", "Samarkand"],
                     "Farg'ona": ["Farg'ona", "Farg`ona", "Fargona", "Farg‘ona"]}
    hdr = header[:] + ["enroll_date", "phone"]
    for r in rows[:160]:
        r = list(r)
        sid, name, g, by, age, fac, group, course, city, gpa, att, eng = r
        enroll = date(2026 - course, 9, 1) if course else date(2023, 9, 1)
        fmt = R.choice(["%Y-%m-%d", "%Y-%m-%d", "%d.%m.%Y", "%Y/%m/%d"])
        phone = f"+998 9{R.randint(0, 9)} {R.randint(100, 999)}-{R.randint(10, 99)}-{R.randint(10, 99)}"
        if R.random() < 0.15:
            phone = phone.replace(" ", "").replace("-", "")
        if city in city_variants and R.random() < 0.6:
            city = R.choice(city_variants[city])
        if R.random() < 0.12:
            name = "  " + name.upper() + " "
        if R.random() < 0.06:
            gpa = ""
        elif R.random() < 0.10:
            gpa = str(gpa).replace(".", ",")
        if R.random() < 0.03:
            age = R.choice([150, -1, 0])
        if R.random() < 0.05:
            att = ""
        out.append([sid, name, g, by, age, fac, group, course, city, gpa, att, eng, enroll.strftime(fmt), phone])
    for k in R.sample(range(len(out)), 12):
        out.append(list(out[k]))
    R.shuffle(out)
    wcsv("students_dirty.csv", hdr, out)


# ---------------------------------------------------------------- books / sales
BOOKS = [
    ("O'tkan kunlar", "Abdulla Qodiriy", "uz", "roman", 1926, 65000),
    ("Mehrobdan chayon", "Abdulla Qodiriy", "uz", "roman", 1929, 58000),
    ("Kecha va kunduz", "Cho'lpon", "uz", "roman", 1936, 55000),
    ("Sariq devni minib", "Xudoyberdi To'xtaboyev", "uz", "bolalar", 1968, 42000),
    ("Shum bola", "G'afur G'ulom", "uz", "qissa", 1936, 39000),
    ("Ufq", "Said Ahmad", "uz", "roman", 1974, 61000),
    ("Dunyoning ishlari", "O'tkir Hoshimov", "uz", "qissa", 1982, 45000),
    ("Ikki eshik orasi", "O'tkir Hoshimov", "uz", "roman", 1986, 69000),
    ("Xamsa (tanlangan)", "Alisher Navoiy", "uz", "she'riyat", 1485, 120000),
    ("Boburnoma", "Zahiriddin Muhammad Bobur", "uz", "tarix", 1530, 98000),
    ("Мастер и Маргарита", "Михаил Булгаков", "ru", "roman", 1967, 72000),
    ("Преступление и наказание", "Фёдор Достоевский", "ru", "roman", 1866, 68000),
    ("Python Crash Course", "Eric Matthes", "en", "texnologiya", 2023, 185000),
    ("Automate the Boring Stuff with Python", "Al Sweigart", "en", "texnologiya", 2025, 175000),
    ("Speech and Language Processing", "Jurafsky, Martin", "en", "texnologiya", 2024, 240000),
    ("Big Data: A Revolution", "Mayer-Schonberger, Cukier", "en", "texnologiya", 2013, 150000),
]
BOOK_CITIES = ["Toshkent", "Samarqand", "Buxoro", "Andijon", "Namangan", "Farg'ona", "Nukus"]


def gen_sales_xlsx():
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
    except ImportError:
        print("! openpyxl не установлен — sales.xlsx пропущен")
        return
    wb = Workbook()
    wb.remove(wb.active)
    oid = 1
    for year, n in ((2025, 240), (2026, 300)):
        ws = wb.create_sheet(str(year))
        hdr = ["order_id", "date", "book", "author", "language", "category", "qty", "price_uzs", "city"]
        ws.append(hdr)
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="1F4E79")
        start = datetime(year, 1, 1)
        for _ in range(n):
            b = R.choices(BOOKS, [6, 3, 4, 3, 4, 2, 3, 3, 2, 2, 3, 3, 3, 2, 1, 1])[0]
            d = start + timedelta(days=R.randint(0, 333 if year == 2026 else 364))
            qty = R.choices([1, 2, 3, 5, 10], [60, 20, 10, 6, 4])[0]
            price = b[5] if year == 2026 else int(b[5] * 0.9 / 1000) * 1000
            ws.append([oid, d.date(), b[0], b[1], b[2], b[3], qty, price, R.choice(BOOK_CITIES)])
            oid += 1
        ws.column_dimensions["B"].width = 12
        ws.column_dimensions["C"].width = 34
        ws.column_dimensions["D"].width = 26
    ws = wb.create_sheet("kitoblar")
    ws.append(["book", "author", "language", "category", "year", "price_uzs"])
    for b in BOOKS:
        ws.append(list(b))
    wb.save(os.path.join(DATA, "sales.xlsx"))


def gen_books_json_xml():
    pubs = [{"name": "Sharq", "city": "Toshkent"}, {"name": "G'afur G'ulom nashriyoti", "city": "Toshkent"},
            {"name": "Akademnashr", "city": "Toshkent"}, {"name": "No Starch Press", "city": "San Francisco"},
            {"name": "АСТ", "city": "Москва"}]
    books = []
    for i, b in enumerate(BOOKS, 1):
        title, author, lang, cat, year, price = b
        doc = {"id": i, "title": title,
               "authors": [{"name": a.strip(), "country": "O'zbekiston" if lang == "uz" else ("Rossiya" if lang == "ru" else "AQSh")}
                           for a in author.split(",")],
               "year": year, "language": lang, "genres": [cat] + (["klassika"] if year < 1990 else []),
               "publisher": R.choice(pubs[:3] if lang == "uz" else (pubs[4:] if lang == "ru" else pubs[3:4])),
               "price": {"amount": price, "currency": "UZS"},
               "rating": round(R.uniform(3.8, 5.0), 1),
               "in_stock": R.random() > 0.2}
        if R.random() < 0.5:
            doc["isbn"] = f"978-9943-{R.randint(10, 99)}-{R.randint(100, 999)}-{R.randint(0, 9)}"
        if lang != "uz" and R.random() < 0.6:
            doc["translator"] = R.choice(["Mirzo Kenjabek", "Ibrohim G'afurov", "Vafo Fayzulloh"])
        doc["reviews"] = [{"user": f"user{R.randint(10, 999)}", "stars": R.randint(3, 5),
                           "text": R.choice(["Juda yoqdi!", "Ajoyib kitob", "Hammaga tavsiya qilaman", "Yaxshi, lekin qimmat",
                                             "Qayta o'qishga arziydi", "Talabalar uchun foydali"])}
                          for _ in range(R.randint(0, 3))]
        books.append(doc)
    wjson("books.json", books)

    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<library name="Universitet kutubxonasi" updated="2026-09-01">']
    for doc in books:
        lines.append(f'  <book id="{doc["id"]}" lang="{doc["language"]}">')
        lines.append(f'    <title>{html.escape(doc["title"])}</title>')
        lines.append(f'    <author>{html.escape(", ".join(a["name"] for a in doc["authors"]))}</author>')
        lines.append(f'    <year>{doc["year"]}</year>')
        lines.append(f'    <genre>{html.escape(doc["genres"][0])}</genre>')
        lines.append(f'    <price currency="UZS">{doc["price"]["amount"]}</price>')
        lines.append(f'    <copies>{R.randint(0, 12)}</copies>')
        lines.append('  </book>')
    lines.append('</library>')
    w("library.xml", "\n".join(lines) + "\n")
    return books


# ---------------------------------------------------------------- corpus
TAGS = {1: ["IT", "startap", "Toshkent"], 2: ["sun'iy intellekt", "ta'lim"], 3: ["Samarqand", "tarix", "turizm"],
        4: ["Navro'z", "bayram", "an'ana"], 5: ["futbol", "terma jamoa"], 6: ["Orol", "ekologiya", "suv"],
        7: ["Navoiy", "kitob", "adabiyot"], 8: ["to'lov", "bank", "raqamli iqtisodiyot"], 9: ["ob-havo", "yomg'ir"],
        10: ["dron", "sensor", "fermer"], 11: ["stipendiya", "talaba"], 12: ["Buxoro", "Xiva", "turizm"],
        13: ["tibbiyot", "katta ma'lumotlar"], 14: ["lingvistika", "til modeli", "korpus"], 15: ["metro", "Toshkent"],
        16: ["ijtimoiy tarmoqlar", "yoshlar"]}


def gen_corpus():
    variants = ["canonical", "ascii", "typographic", "backtick"]
    meta = []
    for a in ARTICLES:
        v = variants[a["id"] % 4]
        fname = f"uz_{a['id']:02d}.txt"
        text = apostrophes(a["title"] + "\n\n" + a["body"] + "\n", v)
        w(f"corpus_uz/{fname}", text)
        meta.append([fname, apostrophes(a["title"], "canonical"), apostrophes(a["category"], "canonical"), a["date"],
                     a["author"], v, f"article/{a['slug']}.html"])
    wcsv("corpus_uz/meta.csv", ["file", "title", "category", "date", "author", "apostrophe_style", "url"], meta)
    for c in CYRILLIC:
        w(f"corpus_cyr/{c['file']}", c["text"])
    sw = sorted(set(apostrophes(x, "canonical") for x in STOPWORDS.split()))
    w("stopwords_uz.txt", "\n".join(sw) + "\n")


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.replace("\n", " ")) if s.strip()]


def gen_news_raw():
    """Грязные тексты для очистки (Л5)."""
    noise_pre = ["<p>", "<div class=\"text\">", "<b>YANGILIK:</b> ", "", "", "&nbsp;", "\t"]
    noise_post = ["</p>", "</div>", " 👍", " 🔥🔥", " Batafsil: https://t.me/yangiliklar_uz", " #yangilik",
                  " (manba: www.talaba-news.uz)", "", "", "   ", " 😊"]
    rows, k = [], 1
    for a in ARTICLES:
        for s in sentences(a["body"]):
            v = R.choice(["canonical", "ascii", "typographic", "backtick", "ascii"])
            t = apostrophes(s, v)
            if R.random() < 0.15:
                t = t.upper()
            if R.random() < 0.2:
                t = t.replace(" ", "  ", 2)
            t = R.choice(noise_pre) + t + R.choice(noise_post)
            rows.append([k, R.choice(["sayt", "telegram", "instagram", "sayt"]), a["date"], t])
            k += 1
    dups = [list(rows[i]) for i in R.sample(range(len(rows)), 25)]
    for d in dups:
        d[0] = k
        k += 1
    rows += dups
    rows.append([k, "telegram", "2026-09-02", ""]); k += 1
    rows.append([k, "sayt", "2026-09-02", "   "]); k += 1
    rows.append([k, "telegram", "2026-09-03", "👍👍👍"]); k += 1
    cyr = sentences(CYRILLIC[1]["text"].split("\n", 2)[2])
    for s in cyr:
        rows.append([k, "telegram", "2026-09-04", s]); k += 1
    R.shuffle(rows)
    wcsv("news_raw.csv", ["id", "source", "date", "raw_text"], rows)


def gen_tweets():
    words_uz = ["Navro'z muborak!", "Sumalak tayyor", "Bugun Toshkentda havo ajoyib", "Bayram sayliga boramiz",
                "Ko'pkari boshlanyapti", "Hammaga tinchlik tilayman", "Bahor keldi", "Yangi kun, yangi umid",
                "Do'stlar bilan sayil", "Milliy taomlar festivali"]
    words_ru = ["С праздником Навруз!", "Отличная погода в Ташкенте", "Сумаляк готов", "Весна пришла"]
    words_en = ["Happy Navruz!", "Great festival in Tashkent", "Spring is here", "Visiting Samarkand today"]
    start = datetime(2026, 3, 21, 10, 0, 0)
    rows = []
    for i in range(1, 2001):
        lang = R.choices(["uz", "ru", "en"], [70, 22, 8])[0]
        txt = R.choice(words_uz if lang == "uz" else words_ru if lang == "ru" else words_en)
        if R.random() < 0.3:
            txt += " " + R.choice(["#Navruz2026", "#Toshkent", "#bahor", "😊", "🌷", "#Uzbekistan"])
        ts = start + timedelta(seconds=int(i * 0.9 + R.random() * 2))
        loc = R.choices(CITIES[:8] + [""], [30, 10, 8, 5, 5, 5, 3, 3, 12])[0]
        plat = R.choices(["telegram", "instagram", "x", "facebook"], [50, 30, 12, 8])[0]
        likes = int(R.expovariate(1 / 25))
        rows.append([i, ts.strftime("%Y-%m-%d %H:%M:%S"), f"user_{R.randint(1, 600)}", plat, lang,
                     "" if R.random() < 0.03 else txt, likes, int(likes * R.random() * 0.3),
                     R.random() < 0.35, loc])
    for k in R.sample(range(len(rows)), 60):
        rows.append(list(rows[k]))
    rows.sort(key=lambda r: r[1])
    wcsv("tweets_stream.csv", ["post_id", "timestamp", "user", "platform", "lang", "text", "likes", "reposts",
                               "has_image", "location"], rows)


def gen_catalog():
    rows = [
        ["Toshkent metrosi turniket loglari", "har bir o'tish: vaqt, bekat, karta turi", 850, 1_200_000_000, "real-time", "CSV, Parquet", 1, 0.5, 0.1, "yo'lovchi oqimini rejalashtirish"],
        ["Telegram kanallari xabarlari", "matn, rasm, video, reaksiyalar", 2300, 3_500_000_000, "real-time", "JSON, rasm, video", 4000, 7.5, 12.0, "jamoatchilik fikrini tahlil qilish"],
        ["Ob-havo meteostansiyalari", "harorat, namlik, bosim, shamol (10 daqiqada)", 40, 520_000_000, "har 10 daqiqa", "CSV", 180, 3.2, 0.4, "prognoz aniqligi"],
        ["Universitet kutubxonasi katalogi", "kitoblar haqida ma'lumot", 0.02, 85_000, "oyiga 1 marta", "XML", 1, 1.0, 0.5, "kitob qidirish"],
        ["Bank karta tranzaksiyalari", "summa, vaqt, terminal, MCC kodi", 5200, 9_000_000_000, "real-time", "Avro, Parquet", 12, 0.2, 0.05, "firibgarlikni aniqlash"],
        ["O'zbek Vikipediyasi dampi", "maqolalar matni va metadata", 1.6, 300_000, "oyiga 1 marta", "XML, wiki-markup", 1, 0.0, 2.0, "til korpusi"],
        ["Shifoxona elektron kartalari", "tashxis, tahlil, retsept, rasm (MRT)", 12000, 450_000_000, "kuniga", "HL7, DICOM, PDF, CSV", 320, 9.0, 3.5, "kasalliklarni bashorat qilish"],
        ["Talabalar baholari (bitta guruh)", "25 talaba, 10 fan bo'yicha baholar", 0.00001, 250, "semestrda 1 marta", "Excel", 1, 2.0, 0.0, "guruh reytingi"],
        ["Dron va dala sensorlari", "namlik, NDVI, suratlar", 640, 75_000_000, "har soat", "CSV, GeoTIFF", 900, 6.0, 1.0, "sug'orishni optimallashtirish"],
        ["Onlayn do'kon sharhlari", "matn + yulduzcha baho", 3.5, 2_400_000, "real-time", "JSON", 3, 4.0, 8.0, "mahsulot sifati tahlili"],
    ]
    wcsv("datasets_catalog.csv", ["name", "description", "size_gb", "records", "update_freq", "formats", "sources",
                                  "missing_pct", "duplicates_pct", "value"], rows)


def gen_reviews():
    pos = ["Kitob juda qiziqarli ekan", "Yetkazib berish tez bo'ldi", "Sifati a'lo", "Narxi arzon va sifatli",
           "Hammaga tavsiya qilaman", "Muqovasi chiroyli", "Ajoyib xizmat", "Sotuvchi juda xushmuomala"]
    neg = ["Yetkazib berish kechikdi", "Kitob sahifalari yirtilgan ekan", "Narxi juda qimmat", "Sifati yomon",
           "Buyurtma noto'g'ri keldi", "Qadoqlash yomon", "Javob berishmadi"]
    neu = ["Oddiy kitob", "Kutganimdek", "Yomon emas", "O'rtacha xizmat"]
    rows = []
    start = date(2026, 1, 1)
    for i in range(1, 181):
        b = R.choice(BOOKS)
        star = R.choices([1, 2, 3, 4, 5], [6, 7, 12, 30, 45])[0]
        pool = pos if star >= 4 else neg if star <= 2 else neu
        txt = R.choice(pool)
        if R.random() < 0.5:
            txt += ". " + R.choice(pos if star >= 4 else neg if star <= 2 else neu + pos[:2])
        rows.append([i, (start + timedelta(days=R.randint(0, 300))).isoformat(), b[0], b[3], star,
                     apostrophes(txt + ".", "canonical"), R.choice(["Toshkent", "Samarqand", "Buxoro", "Andijon", "Nukus"])])
    wcsv("reviews_uz.csv", ["review_id", "date", "book", "category", "stars", "text", "city"], rows)


# ---------------------------------------------------------------- site
SITE_CSS = """body{font-family:Georgia,serif;max-width:860px;margin:0 auto;padding:16px;background:#fbfaf7;color:#222}
header{border-bottom:3px solid #0b6e4f;margin-bottom:16px}header a{color:#0b6e4f;text-decoration:none}
nav a{margin-right:12px;color:#555}.news-card{border-bottom:1px solid #ddd;padding:10px 0}
.meta{color:#777;font-size:14px}.category{background:#0b6e4f;color:#fff;padding:1px 6px;border-radius:3px}
.pagination{margin:20px 0}.ads{background:#ffe9b3;padding:10px;margin:16px 0;font-family:sans-serif}
.tags li{display:inline-block;background:#eee;margin:2px;padding:2px 8px;border-radius:10px;list-style:none}
footer{color:#999;font-size:13px;margin-top:40px;border-top:1px solid #ddd;padding-top:8px}"""


def page(title, body, depth=0):
    pre = "../" * depth
    return f"""<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8">
<title>{html.escape(title)} | Talaba Yangiliklari</title>
<link rel="stylesheet" href="{pre}style.css">
</head>
<body>
<header>
  <h1 class="site-name"><a href="{pre}index.html">Talaba Yangiliklari</a></h1>
  <nav><a href="{pre}index.html">Bosh sahifa</a><a href="{pre}about.html">Biz haqimizda</a></nav>
</header>
<main>
{body}
</main>
<footer>© 2026 Talaba Yangiliklari — o'quv sayti (Big Data trenajyori uchun). Barcha yangiliklar o'ylab topilgan.</footer>
</body>
</html>
"""


def gen_site():
    T = lambda s: apostrophes(s, "typographic")
    arts = sorted(ARTICLES, key=lambda a: a["date"], reverse=True)
    per = 6
    pages = [arts[i:i + per] for i in range(0, len(arts), per)]
    views = {a["id"]: R.randint(300, 25000) for a in ARTICLES}
    for pi, chunk in enumerate(pages, 1):
        cards = []
        for a in chunk:
            d = datetime.strptime(a["date"], "%Y-%m-%d")
            lead = sentences(a["body"])[0]
            cards.append(f"""<article class="news-card">
  <h2 class="news-title"><a href="article/{a['slug']}.html">{html.escape(T(a['title']))}</a></h2>
  <div class="meta"><span class="category">{html.escape(T(a['category']))}</span> · <time datetime="{a['date']}">{d:%d.%m.%Y}</time> · <span class="author">{a['author']}</span></div>
  <p class="lead">{html.escape(T(lead))}</p>
</article>""")
        nav = []
        if pi > 1:
            nav.append(f'<a class="prev" href="{"index.html" if pi == 2 else f"page-{pi - 1}.html"}">← Oldingi</a>')
        nav.append(f'<span class="current">{pi}-sahifa / {len(pages)}</span>')
        if pi < len(pages):
            nav.append(f'<a class="next" href="page-{pi + 1}.html">Keyingi →</a>')
        body = "<h2>So‘nggi yangiliklar</h2>\n" + "\n".join(cards) + f'\n<div class="pagination">{" ".join(nav)}</div>'
        w(f"site/{'index.html' if pi == 1 else f'page-{pi}.html'}", page("Bosh sahifa", body))
    for a in ARTICLES:
        d = datetime.strptime(a["date"], "%Y-%m-%d")
        paras = "\n".join(f"  <p>{html.escape(T(p.strip()))}</p>" for p in a["body"].split("\n\n"))
        tags = "".join(f"<li>{html.escape(T(t))}</li>" for t in TAGS[a["id"]])
        body = f"""<article>
<h1 class="article-title">{html.escape(T(a['title']))}</h1>
<div class="meta"><span class="category">{html.escape(T(a['category']))}</span> · <time datetime="{a['date']}">{d:%d.%m.%Y}</time> · <span class="author">{a['author']}</span> · <span class="views">Ko‘rishlar: {views[a['id']]}</span></div>
<div class="article-body">
{paras}
</div>
<ul class="tags">{tags}</ul>
</article>
<aside class="ads">Reklama: Ingliz tili kurslari — 30% chegirma! Telefon: +998 71 000-00-00</aside>
<p><a href="../index.html">← Bosh sahifaga qaytish</a></p>"""
        w(f"site/article/{a['slug']}.html", page(T(a["title"]), body, depth=1))
    w("site/style.css", SITE_CSS + "\n")
    w("site/about.html", page("Biz haqimizda", "<h2>Biz haqimizda</h2><p>Bu sayt Big Data trenajyori uchun yaratilgan o‘quv sayti. Bu yerdan veb-skreyping mashqlari uchun bemalol foydalanishingiz mumkin.</p>"))
    w("site/robots.txt", "User-agent: *\nAllow: /\nCrawl-delay: 1\n")


# ---------------------------------------------------------------- API
def gen_api(books):
    base = "api/v1"
    per = 5
    total = math.ceil(len(books) / per)
    for p in range(1, total + 1):
        chunk = books[(p - 1) * per:p * per]
        wjson(f"{base}/books/page-{p}.json", {
            "page": p, "per_page": per, "total": len(books), "total_pages": total,
            "next": f"page-{p + 1}.json" if p < total else None,
            "results": [{k: v for k, v in b.items() if k != "reviews"} for b in chunk]})
    for b in books:
        wjson(f"{base}/books/{b['id']}.json", b)
    authors = {}
    for b in books:
        for a in b["authors"]:
            au = authors.setdefault(a["name"], {"name": a["name"], "country": a["country"], "books": []})
            au["books"].append(b["id"])
    wjson(f"{base}/authors.json", {"count": len(authors), "results": list(authors.values())})
    cities = {"tashkent": ("Toshkent", 12, 41.31, 69.28), "samarkand": ("Samarqand", 11, 39.65, 66.96),
              "bukhara": ("Buxoro", 14, 39.77, 64.42), "nukus": ("Nukus", 9, 42.46, 59.6)}
    for key, (name, base_t, lat, lon) in cities.items():
        days = []
        for d in range(31):
            day = date(2026, 3, 1) + timedelta(days=d)
            t = base_t + d * 0.35 + R.gauss(0, 2.5)
            days.append({"date": day.isoformat(), "t_min": round(t - R.uniform(6, 10), 1), "t_max": round(t + R.uniform(2, 6), 1),
                         "precipitation_mm": round(max(0, R.gauss(1.5, 3)), 1) if R.random() < 0.4 else 0.0,
                         "humidity": R.randint(35, 90), "wind_ms": round(R.uniform(0.5, 9), 1)})
        wjson(f"{base}/weather/{key}.json", {"city": name, "coords": {"lat": lat, "lon": lon}, "units": {"t": "°C", "precipitation": "mm", "wind": "m/s"}, "daily": days})
    wjson(f"{base}/index.json", {
        "name": "Talaba Kutubxona API (o'quv)", "version": "1.0",
        "endpoints": {"books (sahifalab)": f"{base}/books/page-1.json", "book": f"{base}/books/<id>.json",
                      "authors": f"{base}/authors.json", "weather": f"{base}/weather/<tashkent|samarkand|bukhara|nukus>.json"}})


# ---------------------------------------------------------------- mongo
def gen_mongo(books):
    arts = []
    for a in ARTICLES:
        text = apostrophes(a["body"].replace("\n\n", " "), "canonical")
        arts.append({"article_id": a["id"], "title": apostrophes(a["title"], "canonical"),
                     "category": apostrophes(a["category"], "canonical"), "date": a["date"], "author": a["author"],
                     "tags": [apostrophes(t, "canonical") for t in TAGS[a["id"]]],
                     "views": R.randint(300, 25000), "likes": R.randint(5, 900),
                     "comments": [{"user": f"user_{R.randint(1, 300)}", "text": apostrophes(R.choice(["Zo'r maqola!", "Rahmat, foydali ma'lumot", "Qo'shilaman", "Batafsilroq yozing", "Ajoyib!"]), "canonical")} for _ in range(R.randint(0, 4))],
                     "words": len(re.findall(r"\w+", text)), "text": text})
    wjson("mongo/articles.json", arts)
    studs = []
    skills_pool = ["Python", "SQL", "Excel", "Pandas", "MongoDB", "Ingliz tili", "Rus tili", "Arab tili", "NLP", "Spark"]
    for i in range(1, 41):
        g, first, last = person()
        studs.append({"student_id": f"S{i:04d}", "name": f"{first} {last}", "gender": g, "age": R.randint(18, 24),
                      "faculty": R.choice(list(FACULTIES)), "course": R.randint(1, 4), "city": R.choices(CITIES, CITY_W)[0],
                      "gpa": round(min(5.0, max(2.8, R.gauss(4.0, 0.45))), 2),
                      "skills": R.sample(skills_pool, R.randint(1, 4)),
                      "contacts": {"email": f"{first.lower().replace(chr(39), '')}.{last.lower()}{i}@talaba.uz", "phone": f"+99890{R.randint(1000000, 9999999)}"},
                      "scholarship": R.random() < 0.3})
    wjson("mongo/students.json", studs)


# ---------------------------------------------------------------- spark
def gen_spark():
    regions = ["Toshkent", "Samarqand", "Buxoro", "Andijon", "Farg'ona", "Namangan", "Xorazm", "Qashqadaryo"]
    products = [("Smartfon", "elektronika", 2_800_000), ("Noutbuk", "elektronika", 7_500_000), ("Quloqchin", "elektronika", 350_000),
                ("Kitob", "kitoblar", 60_000), ("Daftar", "kanselyariya", 8_000), ("Ruchka", "kanselyariya", 3_000),
                ("Choy", "oziq-ovqat", 25_000), ("Non", "oziq-ovqat", 4_000), ("Paxta yog'i", "oziq-ovqat", 28_000)]
    rows = []
    start = datetime(2026, 9, 1)
    for i in range(1, 3001):
        p = R.choices(products, [6, 3, 7, 8, 10, 10, 9, 14, 6])[0]
        qty = R.choices([1, 2, 3, 4, 5, 10], [50, 20, 12, 8, 6, 4])[0]
        t = start + timedelta(minutes=R.randint(0, 60 * 24 * 30))
        rows.append([i, t.strftime("%Y-%m-%d %H:%M:%S"), R.choices(regions, [30, 12, 9, 10, 10, 9, 8, 12])[0],
                     p[0], p[1], qty, p[2], R.choices(["karta", "naqd", "QR"], [50, 25, 25])[0]])
    wcsv("spark/sales_events.csv", ["event_id", "event_time", "region", "product", "category", "qty", "unit_price", "payment"], rows)
    with open(os.path.join(DATA, "spark/students.jsonl"), "w", encoding="utf-8", newline="\n") as f:
        for i in range(1, 31):
            g, first, last = person()
            f.write(json.dumps({"id": i, "name": f"{first} {last}", "faculty": R.choice(list(FACULTIES)),
                                "course": R.randint(1, 4), "gpa": round(R.uniform(3.0, 5.0), 2)}, ensure_ascii=False) + "\n")


def gen_manifest():
    files = []
    for root, _, fs in os.walk(DATA):
        for fn in fs:
            p = os.path.relpath(os.path.join(root, fn), DATA).replace("\\", "/")
            if p == "manifest.json":
                continue
            files.append({"path": p, "size": os.path.getsize(os.path.join(root, fn))})
    files.sort(key=lambda x: x["path"])
    wjson("manifest.json", {"generated": "2026-11-21", "files": files})
    print(f"{len(files)} файлов, {sum(f['size'] for f in files) / 1024:.0f} KB")


if __name__ == "__main__":
    h, rows = gen_students()
    gen_students_dirty(h, rows)
    gen_sales_xlsx()
    books = gen_books_json_xml()
    gen_corpus()
    gen_news_raw()
    gen_tweets()
    gen_catalog()
    gen_reviews()
    gen_site()
    gen_api(books)
    gen_mongo(books)
    gen_spark()
    gen_manifest()
