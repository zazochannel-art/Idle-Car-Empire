# Automotive Empire Simulator — analiză și plan tehnic

Ținta: „Idle Car Empire” devine un **Automotive Empire Simulator** în care mașina este centrul.
Bucla: MATERIALE → FABRICI → COMPONENTE → TRANSPORT → ASAMBLARE → MAȘINI → TESTARE → RACING → DEALERSHIP → VÂNZARE → PROFIT → REINVESTIȚIE.
Regula de lucru: **extindem ce există, nu creăm sisteme paralele.**

## 1. Ce există deja (analiza codului)

| Zonă | Ce există | Unde |
|---|---|---|
| Materiale | 12 materiale, piață cu prețuri care variază, depozit pe fabrică, aprovizionare automată, tendințe de piață | `config/economy.ts`, `engine/materials.ts`, `engine/market.ts` |
| Fabrici | 10 tipuri: Body, Engine, Tire, Assembly, Interior, Suspension, Glass, Paint, Electronics, Battery. Nivel 1–15, viteză, automatizare, grad (Standard→Carbon), depozit, energie, manageri, mod calitate/cantitate, costuri de operare (muncă, energie, mentenanță) | `config/chain.ts`, `engine/chain.ts`, `engine/costs.ts` |
| Componente | 9 componente cu grad 1–5; furnizor pentru anvelope la început | `config/chain.ts` |
| Transport | camioane, semitrailere, transportoare auto vizibile pe hartă, pe drumuri reale; depozit de materiale; nave pentru export | `engine/chain.ts` (shipments), `components/map/traffic.ts` |
| Asamblare | rețetă pe model, stocuri de intrare, interior 3D cu stații (inclusiv mașina în construcție pe etape) | `plant/interior/*`, `three/interior-*` |
| Mașini | 9 platforme (City → Electric) + Design Studio (motor, interior, jante, vopsea, culoare), recenzii, valoare | `config/cars.ts`, `engine/design.ts` |
| Racing | district pe hartă, mașini de curse **produse în fabrică** (comandă → transportor → paddock), statistici fizice din gradul componentelor (CP, greutate, aderență, frânare, aero, fiabilitate), 8 upgrade-uri, uzură, clase D–S, 9 tipuri de cursă, campionate, sponsori, sezon săptămânal | `engine/racing.ts`, `config/racing.ts` |
| Vânzare | 6 dealeri pe clase, cerere, adaos, rute (preț / rapid / dealer ales), export pe 4 piețe | `engine/chain.ts`, `engine/expansion.ts` |
| Reputație | reputație de calitate (rechemări, mod premium) **separată** de reputația de racing | `engine/market.ts`, `racing.rep` |
| R&D | arbore de 31 de cercetări, laborator de prototipuri | `config/research.ts`, `engine/expansion.ts` |
| Evenimente | evenimente de piață temporizate, sezoane, VIP, salon auto, contracte, misiuni zilnice, milestone-uri | `engine/events.ts`, `engine/live.ts`, `engine/contracts.ts` |
| Offline | simulare offline completă (producție, transport, curse) + raport cu registru contabil | `engine/offline.ts` |
| Ghidare | „What's next” (obiective), coach, cartonașe de deblocare | `engine/insights.ts` |
| Unelte | goal-bot, fuzzer, invariante, verificare modele 3D | `scripts/*` |

## 2. Decalaje față de specificație

1. **Car DNA**: statisticile fizice există doar pentru mașinile de curse; mașinile de la dealer sunt doar valori. Lipsesc cuplul, cutia de viteze, frânele, roțile, farurile ca piese reale.
2. **Fabrici lipsă**: Transmission, Brakes, Wheels, Quality Control (R&D există doar ca clădire bonus).
3. **My Cars**: nu există o colecție de mașini proprii cu istoric (doar flota de curse).
4. **Test Track**: lipsește.
5. **Racing Garage**: upgrade-urile există, dar nu au timp de montaj și nici impact pe fiabilitate; lipsesc turbo/ECU.
6. **Dealership**: nu se poate stabili prețul și nici face marketing.
7. **Brand**: nu există nume, logo sau culori de brand, nici atribute de brand (calitate, lux, inovație).
8. **Sponsori**: plătesc doar pe cursă, fără contracte cu obiective.
9. **Evenimente**: evenimentele de piață sunt pasive, fără obiective proprii.
10. **UI**: prea multe intrări; trebuie grupate în EMPIRE / CARS / RACING / BUSINESS.
11. **Economia**: testată până la 10 h; lipsesc testele pentru 24 h, 3 zile și 7 zile.

## 3. Plan pe faze (fiecare fază = un PR testat)

| Fază | Conținut | Extinde |
|---|---|---|
| **1. Car DNA + My Cars + Test Track** ✅ | Modul `engine/car-dna.ts`: DNA complet calculat din piesele reale (grad pe componentă, design, upgrade-uri): motor (nume, CP, cuplu), greutate, caroserie/șasiu, suspensie, frâne, anvelope, jante, aero, cutie, interior, geamuri, faruri, vopsea, calitate, fiabilitate, cost, timp de producție, valoare, performanță. Statisticile de racing se mută în DNA (o singură sursă). Mașinile curselor devin „My Cars” (locație: garaj, racing, showroom), cu istoric. Test Track: 0–100, 0–200, viteză maximă, frânare, viraj, timp pe tur și fiabilitate, toate calculate din DNA. | `racing.statsOf`, `RaceCarState`, `receiveRaceCar` |
| **2. Fabrici noi + integrare în asamblare** ✅ | Transmission, Brakes, Wheels (+ QC ca stație la asamblare); componente noi intră în rețete; gradul lor intră în DNA; furnizor până la construirea fabricii | `config/chain.ts`, rețete, interioare |
| **3. Producție vizuală** ✅ | Linia de asamblare arată mașina pe etape folosind DNA-ul real (jantele, culoarea, motorul instalat) | `interior-engine`, `car-models` |
| **4. Transport** ✅ | Mașinile din My Cars călătoresc cu propriul transportor (vizibil pe hartă) între parcarea fabricii și paddock; o mașină concurează doar ajunsă la paddock; pe drum nu poate fi testată, reparată sau modificată; drumul supraviețuiește salvării. Showroom-ul vine în faza 6 | `chain.ts` (shipments), `racing.ts` |
| **5. Racing garage** | Upgrade-uri cu durată de montaj și impact pe fiabilitate; turbo, ECU; vremea modifică aderența | `racing.ts` |
| **6. Dealership** | Mașini din My Cars puse în showroom cu preț stabilit de jucător; marketing; cererea depinde de DNA + brand | dealeri existenți |
| **7. Brand** | Nume, logo, culori, stil; atribute de calitate, lux, inovație; reputația de brand ≠ reputația de racing | `quality.rep`, `racing.rep` |
| **8. R&D** | Tehnologii pe ramurile cerute, care deblochează variante reale de piese (motoare, materiale ușoare) | `config/research.ts` |
| **9. Evenimente + sponsori** | Evenimente cu obiective (Race Weekend, Factory Week, Electric Week...), sponsori cu contracte | `events.ts`, `SPONSORS` |
| **10. Economie** | Goal-bot pe 15 min, 1 h, 3 h, 10 h, 24 h, 3 zile, 7 zile; recalibrare | `scripts/goal-bot.ts` |
| **11. UI** | Navigare pe 4 piloni: EMPIRE, CARS, RACING, BUSINESS | `game.tsx` |
| **12. Grafică + performanță** | Mașini 3D mai detaliate, LOD, cache de sprite-uri | `three/*` |

## 4. Principii

- Datele salvate rămân compatibile (`migrate*` la fiecare stare nouă).
- Fiecare fază: teste unitare, fuzzer, invariante, simulare goal-bot, verificare în browser.
- Nicio componentă „decorativă”: tot ce apare în UI influențează simularea.
