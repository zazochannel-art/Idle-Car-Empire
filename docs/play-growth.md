# Creștere pe Google Play: ce se face din Play Console

Lucrurile de aici nu sunt cod: se fac din [Play Console](https://play.google.com/console), pentru
aplicația `com.zazochannel.idlecarempire`. Textele sunt gata de copiat, în toate cele șase limbi
ale jocului. Limitele exacte de caractere le arată Console lângă fiecare câmp; textele de mai jos
sunt scurte tocmai ca să încapă.

## 1. Conținut promoțional (LiveOps)

*Grow users → Promotional content → Create.* Fiecare eveniment apare ca un card în Play Store
(pagina jocului, „Evenimente”, recomandări), și pentru cei care nu au jocul, și pentru cei care
l-au dezinstalat. Trimite cardul **cu cel puțin 4–7 zile înainte**: Google îl verifică întâi.

Evenimentele există deja în joc (`src/game/engine/season.ts`, `festival.ts`, `winter.ts`,
`live.ts`, `cup.ts`), deci cardul doar spune ce e deja acolo.

| Eveniment | Când (ora telefonului) | Tip card |
| --- | --- | --- |
| 🛍️ Black Friday | vinerea de după a patra joi din noiembrie → Cyber Monday (2026: 27–30 nov) | Major update / Offer |
| ❄️ Festivalul de iarnă | 1 decembrie → 6 ianuarie | Seasonal event |
| 🌸 Festivalul de primăvară | 21 martie → 10 aprilie | Seasonal event |
| ☀️ Festivalul de vară | 15 iulie → 10 august | Seasonal event |
| 🏆 Cupa săptămânală | în fiecare săptămână (UTC) | Time-limited event |
| 🎪 Auto Show | în fiecare weekend | Time-limited event |

Imagine: 1920×1080 (16:9), fără text mic; un cadru din harta 3D cu sezonul respectiv
(zăpadă iarna, artificii etc.). `marketing/video-creator` poate scoate cadrele.

### Black Friday

- **en**: Black Friday Week — Three goals, Stars and a gold race livery. Ends Cyber Monday!
- **ro**: Săptămâna Black Friday — Trei obiective, Stele și o vopsea de curse aurie. Până luni!
- **ru**: Неделя Чёрной пятницы — Три цели, звёзды и золотая гоночная ливрея. До понедельника!
- **es**: Semana del Black Friday — Tres metas, Estrellas y una decoración dorada. ¡Hasta el lunes!
- **pt**: Semana da Black Friday — Três metas, Estrelas e uma pintura dourada. Até segunda!
- **de**: Black-Friday-Woche — Drei Ziele, Sterne und eine goldene Rennlackierung. Bis Montag!

### Festivalul de iarnă

- **en**: Winter Festival — Snow on the island, an advent calendar and +10% income until 6 Jan.
- **ro**: Festivalul de iarnă — Zăpadă pe insulă, calendar de advent și +10% venit până pe 6 ian.
- **ru**: Зимний фестиваль — Снег на острове, адвент-календарь и +10% дохода до 6 января.
- **es**: Festival de invierno — Nieve en la isla, calendario de adviento y +10% de ingresos hasta el 6 ene.
- **pt**: Festival de inverno — Neve na ilha, calendário do advento e +10% de renda até 6 jan.
- **de**: Winterfest — Schnee auf der Insel, Adventskalender und +10 % Einnahmen bis 6. Jan.

### Festivalul de primăvară / vară

- **en**: Spring Festival / Summer Festival — Three goals sized to your empire, Stars and a new livery.
- **ro**: Festivalul de primăvară / vară — Trei obiective pe măsura imperiului tău, Stele și o vopsea nouă.
- **ru**: Весенний / Летний фестиваль — Три цели под вашу империю, звёзды и новая ливрея.
- **es**: Festival de primavera / verano — Tres metas a la medida de tu imperio, Estrellas y una decoración nueva.
- **pt**: Festival de primavera / verão — Três metas do tamanho do seu império, Estrelas e uma pintura nova.
- **de**: Frühlings- / Sommerfest — Drei Ziele passend zu deinem Imperium, Sterne und eine neue Lackierung.

### Cupa săptămânală

- **en**: Weekly Cup — One track for everyone. Beat the clock, climb the board, win Stars.
- **ro**: Cupa săptămânii — Un singur circuit pentru toți. Bate cronometrul, urcă în clasament, ia Stele.
- **ru**: Еженедельный кубок — Одна трасса для всех. Обгоните время, поднимитесь в таблице, получите звёзды.
- **es**: Copa semanal — Un circuito para todos. Gana al reloj, sube en la tabla, consigue Estrellas.
- **pt**: Copa semanal — Uma pista para todos. Vença o relógio, suba no ranking, ganhe Estrelas.
- **de**: Wochenpokal — Eine Strecke für alle. Schlag die Uhr, steig in der Rangliste, gewinne Sterne.

## 2. Experimente pe pagina din magazin

*Grow users → Store listing experiments.* Câte un experiment o dată, pe 50% din vizitatori,
minimum 7 zile. Ordinea recomandată: **pictograma** (cel mai mare efect), apoi **primele 3
capturi**, apoi **descrierea scurtă**.

Descrierea scurtă actuală (`fastlane/metadata/android/*/short_description.txt`) e varianta A.
Variante de încercat (max. 80 de caractere):

| | B: mașina, nu fabrica | C: idle, offline |
| --- | --- | --- |
| en | Design your own cars, build the factories and race them. Your car empire! | Your car factories keep working while you're away. Build a car empire! |
| ro | Creează-ți mașinile, construiește fabricile și întrece-te cu ele în curse! | Fabricile tale lucrează și când nu joci. Construiește un imperiu auto! |
| ru | Создайте свои машины, постройте заводы и гоняйте на них. Ваша автоимперия! | Ваши автозаводы работают, даже когда вас нет. Постройте автоимперию! |
| es | Diseña tus coches, construye las fábricas y compite con ellos. ¡Tu imperio! | Tus fábricas siguen trabajando cuando no juegas. ¡Crea un imperio del motor! |
| pt | Crie seus carros, construa as fábricas e corra com eles. Seu império! | Suas fábricas continuam trabalhando sem você. Construa um império de carros! |
| de | Entwirf eigene Autos, bau die Fabriken und fahr Rennen. Dein Auto-Imperium! | Deine Autofabriken arbeiten weiter, wenn du weg bist. Bau ein Auto-Imperium! |

Capturi: prima trebuie să arate harta 3D plină (camioane, poduri, fabrici mari), a doua o
mașină proprie în garaj, a treia o cursă. Un text mare pe fiecare (3–4 cuvinte), în limba paginii.

## 3. Pagini personalizate pe țară

*Grow users → Custom store listings.* O pagină pentru România, Moldova, Rusia + CSI, Brazilia +
Portugalia, Spania + America Latină, Germania + Austria + Elveția: capturile cu textul în limba
locală (jocul are deja traducerea, deci capturile se fac direct cu limba schimbată din Setări).

## 4. Google Play Games

Jocul are deja realizări și clasamente legate de Play Games (`src/lib/play-games.ts`). De verificat
în *Play Games Services → Configuration*: toate realizările publicate (nu în draft), cu
pictograme, și clasamentul public. Ele apar în aplicația Play Games și pe profilul jucătorului.

## 5. Campanii plătite (Google Ads → App campaigns)

- Obiectiv: **instalări**, apoi, după ~50 de conversii pe zi, „acțiuni în aplicație” (prima
  mașină construită: evenimentul există în funnel, `docs/funnel.md`).
- Țări de început, ieftine pentru jocuri idle: România, Moldova, Brazilia, Turcia, Indonezia,
  Filipine. Buget de test: 10–20 $/zi, 2 săptămâni.
- Materiale: 5 texte scurte (variantele de mai sus), 3 clipuri verticale de 15 s din
  `marketing/video-creator`, capturile.

## 6. Coduri de creator

Codul de invitație al oricărui cont (`src/game/engine/invites.ts`) e și codul unui creator: îi
faci creatorului un cont, el își spune codul în clipuri, iar jucătorii noi îl introduc și primesc
cadoul de bun venit. Un cod obișnuit primește cel mult 50 de jucători; migrarea
`supabase/migrations/0032_creator_codes.sql` ridică limita pentru conturile trecute în
`ops.creators` (comanda e scrisă în capul migrării). Recompensa creatorului rămâne limitată la 10
prieteni, ca să nu primească sute de Stele. Câți jucători a adus fiecare creator și câți au
construit prima mașină: `select public.admin_creators();` (doar adminii).

### Codul vine singur din link

Cardul și clipul distribuite din joc duc la Play Store printr-un link care conține codul celui
care le-a distribuit (`utm_content`). Pe Android, jocul nou instalat citește linkul o dată
(Google Play Install Referrer, `src/lib/install-referrer.ts`) și folosește codul singur, deci
prietenul primește cadoul fără să scrie nimic. Un creator poate da și el linkul lui:

`https://play.google.com/store/apps/details?id=com.zazochannel.idlecarempire&referrer=utm_source%3Dinvite%26utm_medium%3Dcreator%26utm_content%3DABC234`

(cu codul lui în loc de `ABC234`). În Play Console → *Statistics → Acquisition*, instalările
din aceste linkuri apar la sursa `invite`.

## 7. Comunitate

- Un server Discord cu canale: #anunțuri, #idei, #bug-uri, #imperiul-meu (capturi), pe limbi.
- Linkul lui merge în descrierea completă din magazin și în ecranul Setări → Despre.
- Un jurnal scurt la fiecare versiune (aceleași texte ca `fastlane/.../changelogs`).
