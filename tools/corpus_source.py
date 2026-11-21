# -*- coding: utf-8 -*-
"""Исходные тексты учебного корпуса на узбекском языке (латиница).

Тексты написаны специально для тренажёра (вымышленные новости).
Апостроф здесь записан как ASCII ' ; генератор gen_data.py сам
создаёт варианты с ʻ ʼ, ‘ ’ и ` , чтобы студенты учились нормализации.
"""

ARTICLES = [
{
"id": 1, "slug": "toshkentda-yangi-it-park", "category": "texnologiya", "date": "2026-01-14", "author": "Dilnoza Karimova",
"title": "Toshkentda yangi IT-park ochildi",
"body": """Toshkent shahrida yangi IT-park binosi foydalanishga topshirildi. Bino zamonaviy texnologiyalar bilan jihozlangan bo'lib, unda yuzdan ortiq startap loyiha uchun ish joylari tashkil etilgan. Ochilish marosimida yosh dasturchilar, tadbirkorlar va xorijiy mehmonlar ishtirok etdi.

IT-park rezidentlari soliq imtiyozlaridan foydalanadi. Bu esa kompaniyalarga dasturiy mahsulotlarni xorijga eksport qilish imkonini beradi. Mutaxassislarning fikricha, so'nggi yillarda O'zbekistonda axborot texnologiyalari sohasi tez sur'atlar bilan rivojlanmoqda.

Yangi binoda sun'iy intellekt, katta ma'lumotlar va kiberxavfsizlik bo'yicha laboratoriyalar ham bor. Talabalar bu laboratoriyalarda amaliyot o'tashlari mumkin. Har oyda bepul o'quv kurslari va xakatonlar o'tkazilishi rejalashtirilgan.

"Bizning maqsadimiz yoshlarni zamonaviy kasblarga o'rgatish va ularning g'oyalarini qo'llab-quvvatlash", dedi IT-park direktori. Uning so'zlariga ko'ra, kelgusi yilda viloyatlarda ham shunday markazlar ochiladi."""
},
{
"id": 2, "slug": "suniy-intellekt-talimda", "category": "ta'lim", "date": "2026-01-22", "author": "Bobur Rahimov",
"title": "Sun'iy intellekt ta'limda: imkoniyatlar va xavflar",
"body": """Sun'iy intellekt texnologiyalari ta'lim tizimiga tobora chuqurroq kirib bormoqda. Bugungi kunda talabalar ma'lumot qidirish, matn tarjima qilish va dastur kodi yozish uchun til modellaridan foydalanmoqda.

O'qituvchilar bu jarayonga turlicha munosabatda. Ayrimlar sun'iy intellektni foydali yordamchi deb hisoblaydi. Boshqalar esa talabalar mustaqil fikrlashni unutib qo'yishidan xavotirda.

Mutaxassislar sun'iy intellektdan to'g'ri foydalanishni o'rgatish muhim ekanini ta'kidlaydi. Masalan, til modeli bergan javobni tekshirish, manbalarni solishtirish va xulosani o'zi chiqarish talabaning asosiy vazifasi bo'lib qolishi kerak.

Universitetlarda sun'iy intellekt bo'yicha yangi fanlar joriy etilmoqda. Kompyuter lingvistikasi yo'nalishida o'qiyotgan talabalar o'zbek tilidagi matnlarni avtomatik tahlil qilishni o'rganmoqda. Bu esa o'zbek tili uchun yangi raqamli resurslar yaratishga yordam beradi.

Xulosa qilib aytganda, sun'iy intellekt ta'limning dushmani emas, balki to'g'ri qo'llanilganda kuchli vositadir."""
},
{
"id": 3, "slug": "samarqand-sharqning-durdonasi", "category": "turizm", "date": "2026-02-03", "author": "Sardor Yusupov",
"title": "Samarqand - Sharqning durdonasi",
"body": """Samarqand dunyodagi eng qadimiy shaharlardan biri hisoblanadi. Uning tarixi ikki ming yetti yuz yildan ortiqroq davrni o'z ichiga oladi. Buyuk Ipak yo'li ustida joylashgan bu shahar asrlar davomida savdo va madaniyat markazi bo'lgan.

Registon maydoni Samarqandning ramzi hisoblanadi. Maydonda uchta madrasa joylashgan: Ulug'bek madrasasi, Sherdor madrasasi va Tillakori madrasasi. Har yili minglab sayyohlar bu me'moriy obidalarni ko'rish uchun keladi.

Shahardagi Ulug'bek rasadxonasi ham mashhur. Mirzo Ulug'bek o'z davrining buyuk olimi bo'lib, yulduzlar jadvalini tuzgan. Uning ilmiy merosi bugun ham olimlar tomonidan o'rganilmoqda.

So'nggi yillarda Samarqandda turizm infratuzilmasi yaxshilandi. Yangi mehmonxonalar qurildi, tezyurar poyezd qatnovi yo'lga qo'yildi. Endi Toshkentdan Samarqandga ikki soatdan sal ko'proq vaqtda yetib borish mumkin."""
},
{
"id": 4, "slug": "navroz-bayrami", "category": "madaniyat", "date": "2026-03-20", "author": "Madina Sobirova",
"title": "Navro'z bayrami: an'analar va zamonaviylik",
"body": """Navro'z bahor va yangilanish bayramidir. U har yili yigirma birinchi martda keng nishonlanadi. Bu kunda kecha va kunduz tenglashadi, tabiat uyg'onadi.

Navro'zning eng mashhur taomi sumalakdir. Sumalak bug'doy maysasidan tayyorlanadi va uni pishirish uchun butun kecha qozon atrofida navbatma-navbat kavlab turiladi. Ayollar bu vaqtda qo'shiqlar aytib, bir-birlariga ezgu tilaklar bildiradi.

Bayram kunlari mahallalarda sayillar o'tkaziladi. Kurash, ko'pkari va boshqa milliy o'yinlar tashkil etiladi. Bolalar uchun konsertlar va ko'ngilochar dasturlar tayyorlanadi.

Bugun Navro'z an'analari yangi shakllarda davom etmoqda. Yoshlar bayram tabriklarini ijtimoiy tarmoqlarda baham ko'rmoqda, sumalak pishirish jarayoni esa jonli efirda ko'rsatilmoqda. Shunday bo'lsa-da, bayramning asl ma'nosi, ya'ni mehr-oqibat va tinchlik, o'zgarmasdan qolmoqda."""
},
{
"id": 5, "slug": "terma-jamoa-galaba", "category": "sport", "date": "2026-03-27", "author": "Jasur Ergashev",
"title": "O'zbekiston futbol terma jamoasi g'alaba qozondi",
"body": """O'zbekiston milliy futbol terma jamoasi navbatdagi saralash o'yinida ishonchli g'alabaga erishdi. Toshkentdagi "Milliy" stadionida o'tgan uchrashuv ikki-nol hisobida yakunlandi.

Birinchi gol o'yinning o'n beshinchi daqiqasida urildi. Yarim himoyachi jarima maydoni tashqarisidan kuchli zarba berib, darvozabonni mag'lub etdi. Ikkinchi to'p esa ikkinchi bo'limda burchak to'pi oshirilgandan so'ng kiritildi.

Stadionga o'ttiz besh mingdan ortiq muxlis tashrif buyurdi. Ular butun o'yin davomida jamoani qo'llab-quvvatlab turdi. Bosh murabbiy o'yindan so'ng futbolchilarning intizomi va jamoaviy harakatini yuqori baholadi.

Ushbu g'alabadan so'ng terma jamoa guruhda birinchi o'rinni egalladi. Keyingi o'yin bir oydan keyin xorijda bo'lib o'tadi. Muxlislar jamoadan yangi g'alabalar kutmoqda."""
},
{
"id": 6, "slug": "orol-dengizi-muammosi", "category": "ekologiya", "date": "2026-04-08", "author": "Nilufar Qodirova",
"title": "Orol dengizi muammosi va yechimlari",
"body": """Orol dengizining qurishi yigirmanchi asrning eng katta ekologik fojialaridan biri hisoblanadi. Bir vaqtlar dunyodagi eng yirik ko'llardan biri bo'lgan dengiz maydoni bugun bir necha barobar qisqargan.

Muammoning asosiy sababi Amudaryo va Sirdaryo suvlarining paxta dalalarini sug'orish uchun haddan tashqari ko'p ishlatilganidir. Natijada dengiz tubi qurib, tuzli cho'l paydo bo'ldi. Shamol tuz va changni uzoq masofalarga olib ketmoqda.

Hozirgi kunda Orolbo'yi hududida katta ko'kalamzorlashtirish ishlari olib borilmoqda. Qurigan dengiz tubiga saksovul va boshqa cho'lga chidamli o'simliklar ekilmoqda. Bu o'rmonlar tuz va chang ko'tarilishini kamaytiradi.

Olimlar sun'iy yo'ldosh suratlari va sensorlardan olingan katta ma'lumotlarni tahlil qilib, hududdagi o'zgarishlarni kuzatib bormoqda. Bunday ma'lumotlar ekologik qarorlarni to'g'ri qabul qilishga yordam beradi."""
},
{
"id": 7, "slug": "navoiy-merosi-kitobxonlik", "category": "adabiyot", "date": "2026-02-09", "author": "Gulnora Ismoilova",
"title": "Alisher Navoiy merosi va zamonaviy kitobxonlik",
"body": """Alisher Navoiy o'zbek adabiyotining asoschisi va buyuk mutafakkiri hisoblanadi. U turkiy tilda ko'plab dostonlar va g'azallar yaratgan. "Xamsa" asari jahon adabiyotining nodir durdonalaridan biridir.

Navoiy "Muhokamat ul-lug'atayn" asarida turkiy tilning boyligini isbotlab bergan. Olimlarning fikricha, bu asarni tilshunoslik sohasidagi dastlabki qiyosiy tadqiqotlardan biri deb hisoblash mumkin.

Bugungi kunda Navoiy asarlari raqamli kutubxonalarga joylashtirilmoqda. Elektron matnlar tadqiqotchilarga so'zlarning qo'llanish chastotasini hisoblash va mumtoz til lug'atini tuzish imkonini beradi.

Kitobxonlikni rivojlantirish maqsadida maktab va universitetlarda tanlovlar o'tkazilmoqda. Yoshlar orasida audiokitoblar va elektron kitoblarga qiziqish ortib bormoqda. Mutaxassislar har bir yosh oyiga kamida bitta kitob o'qishini tavsiya qiladi."""
},
{
"id": 8, "slug": "onlayn-tolovlar", "category": "iqtisodiyot", "date": "2026-04-15", "author": "Otabek Nazarov",
"title": "Raqamli iqtisodiyot: onlayn to'lovlar ommalashmoqda",
"body": """O'zbekistonda onlayn to'lovlar soni yildan yilga oshib bormoqda. Aholi kommunal xizmatlar, internet va mobil aloqa uchun to'lovlarni telefon orqali amalga oshirmoqda.

Banklar yangi mobil ilovalarni ishga tushirmoqda. Ushbu ilovalar yordamida bir necha soniya ichida pul o'tkazish, kredit to'lash va omonat ochish mumkin. Naqd pulsiz hisob-kitoblar ayniqsa yoshlar orasida mashhur.

Iqtisodchilarning fikricha, raqamli to'lovlar biznes uchun ham qulay. Tadbirkorlar savdo hajmini real vaqt rejimida kuzatadi va xaridorlar xatti-harakatini tahlil qiladi. Har kuni millionlab tranzaksiyalar haqidagi ma'lumotlar yig'iladi.

Shu bilan birga, kiberxavfsizlik masalasi dolzarb bo'lib qolmoqda. Mutaxassislar foydalanuvchilarga parollarini hech kimga aytmaslik va shubhali havolalarni ochmaslikni maslahat beradi."""
},
{
"id": 9, "slug": "bahorgi-ob-havo", "category": "ob-havo", "date": "2026-04-02", "author": "Zarina Murodova",
"title": "Bahorgi ob-havo: yomg'irli kunlar kutilmoqda",
"body": """Gidrometeorologiya xizmati markazining ma'lumotiga ko'ra, kelgusi hafta respublikaning aksariyat hududlarida yomg'irli kunlar kutilmoqda. Ayrim tog'li hududlarda do'l yog'ishi ham mumkin.

Toshkentda kunduzi havo harorati o'n sakkiz, yigirma darajagacha iliq bo'ladi. Kechasi esa harorat sakkiz, o'n darajagacha pasayadi. Samarqand va Buxoroda havo biroz issiqroq bo'lishi kutilmoqda.

Sinoptiklar haydovchilarni yo'llarda ehtiyot bo'lishga chaqirmoqda. Kuchli shamol paytida daraxtlar tagida va reklama taxtalari yonida turmaslik tavsiya etiladi.

Ob-havo ma'lumotlari endilikda avtomatik meteostansiyalardan har o'n daqiqada yig'ilmoqda. Bu ma'lumotlar katta hajmdagi ma'lumotlar bazasida saqlanadi va prognoz aniqligini oshirishda qo'llaniladi."""
},
{
"id": 10, "slug": "qishloq-xojaligida-dronlar", "category": "texnologiya", "date": "2026-05-06", "author": "Rustam Toshmatov",
"title": "Qishloq xo'jaligida dron va sensorlar",
"body": """Fermerlar ekin maydonlarini kuzatish uchun dronlardan tobora ko'proq foydalanmoqda. Dronlar dalalarni havodan suratga olib, o'simliklarning holatini aniqlashga yordam beradi.

Tuproqqa o'rnatilgan sensorlar namlik, harorat va o'g'it miqdori haqida doimiy ma'lumot yuboradi. Bu ma'lumotlar asosida sug'orish vaqti va suv miqdori aniqlanadi. Natijada suv tejaladi, hosildorlik esa oshadi.

Farg'ona vodiysidagi bir fermer xo'jaligi tomchilatib sug'orish va aqlli sensorlar tizimini joriy etdi. Xo'jalik rahbarining aytishicha, suv sarfi qariyb qirq foizga kamaygan.

Mutaxassislar bunday texnologiyalar kichik fermerlar uchun ham arzonlashishi kerakligini ta'kidlaydi. Davlat dasturi doirasida fermerlarga imtiyozli kreditlar ajratilmoqda."""
},
{
"id": 11, "slug": "yangi-stipendiya-dasturi", "category": "ta'lim", "date": "2026-05-19", "author": "Kamola Hasanova",
"title": "Talabalar uchun yangi stipendiya dasturi",
"body": """Oliy ta'lim vazirligi iqtidorli talabalar uchun yangi stipendiya dasturini e'lon qildi. Dastur doirasida a'lo baholarga o'qiyotgan va ilmiy faoliyat bilan shug'ullanayotgan talabalar qo'shimcha moddiy yordam oladi.

Stipendiyaga da'vogarlar onlayn ariza topshiradi. Arizada talabaning reytingi, ilmiy maqolalari va ijtimoiy faolligi haqida ma'lumot ko'rsatiladi. Tanlov natijalari ochiq e'lon qilinadi.

Shuningdek, xorijiy universitetlarda qisqa muddatli malaka oshirish imkoniyati ham yaratiladi. Eng faol talabalar yozgi maktablarda qatnashib, xalqaro loyihalarda tajriba orttiradi.

Talabalar yangi dasturni mamnuniyat bilan kutib oldi. "Bu bizni yaxshiroq o'qishga va ilm bilan shug'ullanishga undaydi", deydi uchinchi kurs talabasi."""
},
{
"id": 12, "slug": "buxoro-xiva-turistlar", "category": "turizm", "date": "2026-06-11", "author": "Sardor Yusupov",
"title": "Buxoro va Xivada turistlar soni oshdi",
"body": """Joriy yilning birinchi yarmida Buxoro va Xivaga tashrif buyurgan xorijiy sayyohlar soni o'tgan yilga nisbatan sezilarli darajada oshdi. Turizm qo'mitasi bu haqda statistik ma'lumotlarni e'lon qildi.

Buxoroning tarixiy markazi va Xivaning Ichan qal'a majmuasi YuNESKO Butunjahon merosi ro'yxatiga kiritilgan. Sayyohlar bu yerda qadimiy minoralar, masjidlar va karvonsaroylarni tomosha qiladi.

Mehmonxonalarning band bo'lish darajasi yuqoriligicha qolmoqda. Ko'plab oilaviy mehmon uylari ochildi. Hunarmandlar esa sayyohlarga kulolchilik, zardo'zlik va gilam to'qish bo'yicha mahorat darslarini o'tkazmoqda.

Turizm mutaxassislari sayyohlarning fikr-mulohazalarini ijtimoiy tarmoqlar va bron qilish saytlaridan yig'ib tahlil qilmoqda. Bu tahlil xizmat sifatini yaxshilashga yordam beradi."""
},
{
"id": 13, "slug": "tibbiyotda-katta-malumotlar", "category": "tibbiyot", "date": "2026-06-24", "author": "Nodira Aliyeva",
"title": "Tibbiyotda katta ma'lumotlar: shifoxonalar raqamlashtirilmoqda",
"body": """Respublika shifoxonalarida elektron tibbiy karta tizimi joriy etilmoqda. Endi bemorning kasallik tarixi, tahlil natijalari va retseptlari yagona raqamli bazada saqlanadi.

Shifokorlar bemor haqidagi ma'lumotlarni bir necha soniyada topishi mumkin. Bu tashxis qo'yish vaqtini qisqartiradi va xatolar ehtimolini kamaytiradi.

Katta hajmdagi tibbiy ma'lumotlarni tahlil qilish kasalliklarning tarqalishini oldindan bashorat qilishga imkon beradi. Masalan, gripp mavsumida qaysi hududlarda bemorlar soni ortishini aniqlash mumkin.

Shu bilan birga, shaxsiy ma'lumotlarni himoya qilish eng muhim talablardan biri bo'lib qolmoqda. Bemorlarning ma'lumotlari faqat ruxsat etilgan shifokorlarga ochiq bo'lishi kerak."""
},
{
"id": 14, "slug": "ozbek-tili-uchun-til-modellari", "category": "fan", "date": "2026-07-07", "author": "Dilnoza Karimova",
"title": "Kompyuter lingvistikasi: o'zbek tili uchun til modellari",
"body": """Kompyuter lingvistikasi tilshunoslik va informatika chegarasida joylashgan zamonaviy fan sohasidir. U matnlarni avtomatik tahlil qilish, tarjima qilish va nutqni tanib olish bilan shug'ullanadi.

O'zbek tili uchun til modellarini yaratishda eng katta muammo katta hajmdagi sifatli matnlar korpusining yetishmasligidir. Bundan tashqari, o'zbek tilida lotin va kirill yozuvlari parallel ishlatiladi. Apostrof belgilarining turlicha yozilishi ham matnlarni qayta ishlashni qiyinlashtiradi.

Tadqiqotchilar yangiliklar saytlari, kitoblar va ijtimoiy tarmoqlardagi matnlardan katta korpuslar yig'moqda. Matnlar tozalanadi, normallashtiriladi va tokenlarga ajratiladi.

O'zbek tili agglyutinativ til bo'lgani uchun bitta so'zga bir nechta qo'shimcha qo'shilishi mumkin. Masalan, "kitoblarimizdan" so'zida o'zakka uchta qo'shimcha qo'shilgan. Shuning uchun morfologik tahlil o'zbek tili uchun ayniqsa muhimdir."""
},
{
"id": 15, "slug": "toshkent-metrosi-yangi-bekatlar", "category": "jamiyat", "date": "2026-08-18", "author": "Bobur Rahimov",
"title": "Toshkent metrosi: yangi bekatlar foydalanishga topshirildi",
"body": """Toshkent metropolitenining yer usti halqa yo'lida yangi bekatlar ochildi. Endi poytaxtning chekka mahallalarida yashovchilar shahar markaziga tezroq yetib borishi mumkin.

Yangi bekatlar zamonaviy dizayn asosida qurilgan. Ularda liftlar, eskalatorlar va nogironligi bo'lgan shaxslar uchun qulayliklar mavjud. Yo'lovchilar yo'l haqini transport kartasi yoki QR-kod orqali to'lashi mumkin.

Metropoliten ma'lumotlariga ko'ra, har kuni bir milliondan ortiq yo'lovchi metrodan foydalanadi. Turniketlardan olinadigan ma'lumotlar yo'lovchilar oqimini tahlil qilish va poyezdlar qatnovini rejalashtirish uchun ishlatiladi.

Kelgusi yillarda metro tarmog'ini yanada kengaytirish rejalashtirilgan. Bu shahar ko'chalaridagi tirbandlikni kamaytirishga xizmat qiladi."""
},
{
"id": 16, "slug": "yoshlar-va-ijtimoiy-tarmoqlar", "category": "jamiyat", "date": "2026-09-01", "author": "Madina Sobirova",
"title": "Yoshlar va ijtimoiy tarmoqlar",
"body": """Bugungi yoshlar kunining katta qismini ijtimoiy tarmoqlarda o'tkazmoqda. Telegram, Instagram va YouTube O'zbekistonda eng mashhur platformalar hisoblanadi.

Ijtimoiy tarmoqlar yangi do'stlar orttirish, bilim olish va o'z ijodini namoyish qilish uchun qulay maydondir. Ko'plab yoshlar bloger sifatida faoliyat yuritib, ta'limiy kontent yaratmoqda.

Biroq psixologlar ekran oldida haddan tashqari ko'p vaqt o'tkazish salbiy oqibatlarga olib kelishi mumkinligini ogohlantirmoqda. Uyqusizlik, diqqatning tarqoqligi va jismoniy faollikning kamayishi shular jumlasidandir.

Ijtimoiy tarmoqlarda har daqiqada millionlab xabarlar, rasmlar va videolar paydo bo'ladi. Bu katta ma'lumotlar tadqiqotchilar uchun jamiyatdagi kayfiyat va dolzarb mavzularni o'rganish imkonini beradi."""
},
]

# Тексты в кириллице (для транслитерации, Л5)
CYRILLIC = [
{"file": "kitob_bilim_manbai.txt", "text": """Китоб — билим манбаи

Китоб инсоннинг энг яқин дўсти ҳисобланади. Ёшлар китоб ўқиш орқали дунёқарашини кенгайтиради. Кутубхоналарда минглаб китоблар сақланади. Ҳозир кўпчилик электрон китобларни телефонда ўқийди. Олимлар ўзбек тилидаги китобларни рақамлаштириш устида ишламоқда. Бу ишлар келажак авлод учун жуда муҳимдир.
"""},
{"file": "ozbek_tili_raqamli.txt", "text": """Ўзбек тили ва рақамли технологиялар

Ўзбек тили давлат тили сифатида кенг қўлланилади. Бугунги кунда интернетда ўзбек тилидаги матнлар сони тез ортиб бормоқда. Аммо кўплаб сайтларда ҳали ҳам кирилл ёзуви ишлатилади. Шунинг учун матнларни бир ёзувдан иккинчисига автоматик ўгириш муҳим вазифадир. Транслитерация дастурлари ҳарфларни мослик жадвали асосида алмаштиради. Масалан, «ш» ҳарфи «sh», «ч» ҳарфи «ch» шаклида ёзилади. Янги қоидага кўра, «ғ» ва «ў» ҳарфлари ҳам махсус белги билан ёзилади.
"""},
]

STOPWORDS = """va bilan uchun bu shu u ular biz men sen siz ham esa lekin ammo biroq yoki emas edi ekan deb kabi
bir har eng juda endi hali faqat yana chunki agar ya'ni ba'zi boshqa barcha hamma o'z o'zi bo'lib bo'lgan
bo'ladi bo'lsa qilib qiladi etib etadi uning ularning bizning mening sizning keyin oldin so'ng orqali haqida
tomonidan ko'ra bo'yicha asosida sifatida ichida davomida ustida tashqari birga ko'p kam necha nima qanday
qaysi kim qachon qayerda nega mumkin kerak bor yo'q mana ana shunday bunday shuning buning unda bunda shunda
hozir bugun balki ham-da yanada ayniqsa ushbu mazkur o'sha hech hech-qanday"""
