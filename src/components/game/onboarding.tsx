"use client";

import { ArrowRight, Check, Factory, Flag, Hammer, MapPin, Package, X } from "lucide-react";
import { useEffect, useState } from "react";
import { suggestedRestock, unitsInStock, type RestockPlan } from "@/game/engine/materials";
import { formatMoney } from "@/game/format";
import type { GameState, Lang } from "@/game/types";
import type { EconomySnapshot } from "@/game/engine/economy";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "idle-car-empire:onboarding-dismissed";

type Step = {
  icon: typeof Factory;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
  action: Record<Lang, string>;
};

const STEPS: Step[] = [
  {
    icon: Factory,
    title: { en: "Start with your factory", ro: "Începe cu fabrica ta", ru: "Начни со своей фабрики", es: "Empieza por tu fábrica", pt: "Comece pela sua fábrica", de: "Fang mit deinem Werk an" },
    body: {
      en: "Your company already owns a small Body Works. Open it first and learn what it produces, how fast it works and where the materials go.",
      ro: "Compania ta are deja o mică fabrică de caroserii. Deschide-o și vezi ce produce, cât de repede lucrează și unde merg materialele.",
      ru: "У твоей компании уже есть небольшой завод кузовов. Сначала открой его и посмотри, что он производит, как работает и куда идут материалы.",
      es: "Tu empresa ya tiene una pequeña Fábrica de carrocerías. Ábrela primero y mira qué produce, a qué ritmo trabaja y adónde van los materiales.",
      pt: "Sua empresa já tem uma pequena Fábrica de carrocerias. Abra-a primeiro e veja o que ela produz, em que ritmo trabalha e para onde vão os materiais.",
      de: "Deine Firma besitzt schon ein kleines Karosseriewerk. Öffne es zuerst und sieh dir an, was es herstellt, wie schnell es arbeitet und wohin das Material geht.",
    },
    action: { en: "Open factory", ro: "Deschide fabrica", ru: "Открыть фабрику", es: "Abrir fábrica", pt: "Abrir fábrica", de: "Werk öffnen" },
  },
  {
    icon: Factory,
    title: { en: "Watch production", ro: "Urmărește producția", ru: "Наблюдай за производством", es: "Mira la producción", pt: "Acompanhe a produção", de: "Sieh der Produktion zu" },
    body: {
      en: "Production is automatic. The factory consumes materials, creates parts and sends them through the supply chain.",
      ro: "Producția este automată. Fabrica consumă materiale, creează componente și le trimite prin lanțul de producție.",
      ru: "Производство автоматическое. Завод использует материалы, выпускает детали и отправляет их по цепочке.",
      es: "La producción es automática. La fábrica consume materiales, crea piezas y las envía por la cadena de suministro.",
      pt: "A produção é automática. A fábrica consome materiais, cria peças e as envia pela cadeia de suprimentos.",
      de: "Die Produktion läuft automatisch. Das Werk verbraucht Material, stellt Teile her und schickt sie durch die Lieferkette.",
    },
    action: { en: "Show factory floor", ro: "Vezi hala de producție", ru: "Открыть цех", es: "Ver la planta", pt: "Ver o chão de fábrica", de: "Werkhalle zeigen" },
  },
  {
    icon: Package,
    title: { en: "Keep it supplied", ro: "Aprovizionează fabrica", ru: "Снабжай завод", es: "Mantenla abastecida", pt: "Mantenha-a abastecida", de: "Halte es versorgt" },
    body: {
      en: "A factory without steel stops, and the materials it started with last only a couple of minutes. Buy a few more now. Later, when the goal card asks for materials, buy them in the factory's 📦 MATERIALS menu.",
      ro: "Fără oțel, fabrica se oprește, iar materialele de la început ajung doar câteva minute. Cumpără câteva acum. Mai târziu, când obiectivul de jos cere materiale, le cumperi din meniul 📦 MATERIALE al fabricii.",
      ru: "Без стали завод встаёт, а стартовых материалов хватит лишь на пару минут. Купи ещё немного сейчас. Позже, когда цель внизу попросит материалы, покупай их в меню завода 📦 МАТЕРИАЛЫ.",
      es: "Una fábrica sin acero se para, y los materiales iniciales solo duran un par de minutos. Compra algunos más ahora. Después, cuando la tarjeta de objetivo pida materiales, cómpralos en el menú 📦 MATERIALES de la fábrica.",
      pt: "Uma fábrica sem aço para, e os materiais iniciais duram só alguns minutos. Compre mais alguns agora. Depois, quando o cartão de meta pedir materiais, compre-os no menu 📦 MATERIAIS da fábrica.",
      de: "Ohne Stahl steht ein Werk still, und das Startmaterial reicht nur ein paar Minuten. Kauf jetzt etwas nach. Später, wenn die Zielkarte nach Material fragt, kaufst du es im Menü 📦 MATERIAL des Werks.",
    },
    action: { en: "Buy materials", ro: "Cumpără materiale", ru: "Купить материалы", es: "Comprar materiales", pt: "Comprar materiais", de: "Material kaufen" },
  },
  {
    icon: Hammer,
    title: { en: "Build your next factory", ro: "Construiește următoarea fabrică", ru: "Построй следующий завод", es: "Construye tu próxima fábrica", pt: "Construa sua próxima fábrica", de: "Bau dein nächstes Werk" },
    body: {
      en: "Your first Body Works is only the beginning. Buy land and build the next production stage when you can afford it. New factories unlock the car supply chain.",
      ro: "Prima fabrică este doar începutul. Cumpără teren și construiește următoarea etapă când îți permiți. Fabricile noi deschid lanțul de producție auto.",
      ru: "Первый завод — только начало. Покупай землю и строй следующий этап, когда хватит денег. Новые заводы открывают автомобильную цепочку.",
      es: "Tu primera Fábrica de carrocerías es solo el principio. Compra terreno y construye la siguiente etapa de producción cuando puedas pagarla. Las fábricas nuevas desbloquean la cadena de suministro del coche.",
      pt: "Sua primeira Fábrica de carrocerias é só o começo. Compre terreno e construa a próxima etapa de produção quando puder pagar. Fábricas novas liberam a cadeia de suprimentos do carro.",
      de: "Dein erstes Karosseriewerk ist nur der Anfang. Kauf Land und bau die nächste Produktionsstufe, sobald du sie dir leisten kannst. Neue Werke schalten die Lieferkette fürs Auto frei.",
    },
    action: { en: "Open Build", ro: "Deschide Construiește", ru: "Открыть строительство", es: "Abrir Construir", pt: "Abrir Construir", de: "Bauen öffnen" },
  },
  {
    icon: MapPin,
    title: { en: "Grow the empire", ro: "Extinde imperiul", ru: "Расширяй империю", es: "Haz crecer el imperio", pt: "Faça o império crescer", de: "Lass das Imperium wachsen" },
    body: {
      en: "Use the map to follow materials, factories, trucks and finished products. Expand district by district instead of spending everything at once.",
      ro: "Folosește harta pentru a urmări materialele, fabricile, camioanele și produsele finite. Extinde-te district cu district.",
      ru: "Используй карту, чтобы следить за материалами, заводами, грузовиками и готовой продукцией. Расширяйся район за районом.",
      es: "Usa el mapa para seguir materiales, fábricas, camiones y productos terminados. Crece distrito a distrito en lugar de gastarlo todo de golpe.",
      pt: "Use o mapa para acompanhar materiais, fábricas, caminhões e produtos prontos. Cresça distrito por distrito em vez de gastar tudo de uma vez.",
      de: "Verfolge auf der Karte Material, Werke, Lkw und fertige Produkte. Wachse Viertel für Viertel, statt alles auf einmal auszugeben.",
    },
    action: { en: "Show the map", ro: "Arată harta", ru: "Показать карту", es: "Ver el mapa", pt: "Mostrar o mapa", de: "Karte zeigen" },
  },
  {
    icon: Flag,
    title: { en: "Race when you're ready", ro: "Intră în curse când ești pregătit", ru: "Выходи на гонки, когда будешь готов", es: "Corre cuando estés listo", pt: "Corra quando estiver pronto", de: "Fahr Rennen, wenn du bereit bist" },
    body: {
      en: "Racing comes later. First build a stable production business, then use cars, racing and upgrades to turn your factory into an automotive empire.",
      ro: "Cursele vin mai târziu. Mai întâi construiește o producție stabilă, apoi folosește mașinile, cursele și upgrade-urile pentru a transforma fabrica într-un imperiu auto.",
      ru: "Гонки будут позже. Сначала создай стабильное производство, затем используй машины, гонки и улучшения, чтобы превратить завод в автоимперию.",
      es: "Las carreras llegan más tarde. Primero crea un negocio de producción estable y luego usa coches, carreras y mejoras para convertir tu fábrica en un imperio del automóvil.",
      pt: "As corridas vêm depois. Primeiro monte uma produção estável, depois use carros, corridas e melhorias para transformar sua fábrica num império automotivo.",
      de: "Rennen kommen später. Bau zuerst eine stabile Produktion auf und mach dann mit Autos, Rennen und Upgrades aus deinem Werk ein Auto-Imperium.",
    },
    action: { en: "Start building", ro: "Începe construcția", ru: "Начать строительство", es: "Empezar a construir", pt: "Começar a construir", de: "Losbauen" },
  },
];

const copy = {
  en: { eyebrow: "FIRST COMPANY", title: "Welcome to Idle Car Empire", skip: "Skip tutorial", next: "Next", done: "Start my empire", progress: "Step" },
  ro: { eyebrow: "PRIMA COMPANIE", title: "Bine ai venit în Idle Car Empire", skip: "Sari peste tutorial", next: "Următorul", done: "Începe imperiul", progress: "Pasul" },
  ru: { eyebrow: "ПЕРВАЯ КОМПАНИЯ", title: "Добро пожаловать в Idle Car Empire", skip: "Пропустить обучение", next: "Далее", done: "Начать империю", progress: "Шаг" },
  es: { eyebrow: "PRIMERA EMPRESA", title: "Te damos la bienvenida a Idle Car Empire", skip: "Saltar tutorial", next: "Siguiente", done: "Empezar mi imperio", progress: "Paso" },
  pt: { eyebrow: "PRIMEIRA EMPRESA", title: "Boas-vindas ao Idle Car Empire", skip: "Pular tutorial", next: "Próximo", done: "Começar meu império", progress: "Passo" },
  de: { eyebrow: "ERSTE FIRMA", title: "Willkommen bei Idle Car Empire", skip: "Tutorial überspringen", next: "Weiter", done: "Mein Imperium starten", progress: "Schritt" },
} satisfies Record<Lang, Record<string, string>>;

function languageOf(lang: string): Lang {
  return Object.hasOwn(copy, lang) ? (lang as Lang) : "en";
}

/** The tour step that buys the starter works its next materials. */
const SUPPLY_STEP = 2;
/** Units' worth bought there on top of the stock: a couple more minutes of work, leaving cash for the Engine Factory. */
const SUPPLY_UNITS = 2;

const starterPlot = (s: GameState) => Object.keys(s.city.buildings).find((id) => s.city.buildings[id]?.type === "bodyWorks");

/**
 * The order the supply step places: SUPPLY_UNITS more units of material than the starter works
 * has (a player who reaches the step in the first seconds still has all the starting stock), as
 * the materials menu would offer them; null when nothing fits the cash or the warehouse.
 */
function starterRestock(s: GameState, snap: EconomySnapshot): { plot: string; plan: RestockPlan } | null {
  const plot = starterPlot(s);
  const plant = plot ? s.city.buildings[plot]?.plant : undefined;
  const need = plot ? snap.chain.plants[plot]?.need : undefined;
  const have = plant && need ? unitsInStock(plant, need).n : NaN;
  if (!plot || !need || !Number.isFinite(have)) return null;
  const plan = suggestedRestock(s, plot, need, have + SUPPLY_UNITS);
  return plan.units > 0 && plan.cost > 0 ? { plot, plan } : null;
}

export function Onboarding() {
  const ready = useGame((g) => g.ready);
  const lang = useGame((g) => g.state.settings.lang);
  const [dismissed, setDismissed] = useState(true);
  const [step, setStep] = useState(0);
  const setTutorial = useUi((u) => u.setTutorial);
  // the supply step's button says what the order costs before it is placed
  const supplyCost = useGame((g) => (step === SUPPLY_STEP ? (starterRestock(g.state, g.snap)?.plan.cost ?? 0) : 0));

  useEffect(() => {
    // decided once the save has loaded: a returning player whose plants already
    // make cars doesn't need the first-company tour
    if (!ready) return;
    const timer = window.setTimeout(() => {
      let seen = false;
      try {
        seen = localStorage.getItem(STORAGE_KEY) === "1";
      } catch {
        // storage unavailable: show the tour
      }
      setDismissed(seen || useGame.getState().state.chain.firstCar);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const visible = ready && !dismissed;
  useEffect(() => {
    setTutorial(visible);
  }, [visible, setTutorial]);

  if (!visible) return null;

  const l = languageOf(lang);
  const text = STEPS[step];
  const Icon = text.icon;
  const c = copy[l];

  const go = () => {
    const ui = useUi.getState();
    const game = useGame.getState();
    const starter = starterPlot(game.state);
    if (step === 0) {
      if (starter) ui.selectPlot(starter);
    } else if (step === 1) {
      if (starter) ui.openFloor(starter);
    } else if (step === SUPPLY_STEP) {
      // the order the button showed (nothing if the cash can't cover it: the goal card asks again later)
      const order = starterRestock(game.state, game.snap);
      if (order) game.buyPlan(order.plot, order.plan);
      ui.openFloor(null);
      if (starter) ui.selectPlot(starter);
    } else if (step === 3) {
      ui.setView("build");
    } else if (step === 4) {
      ui.closeAll();
      ui.map({ kind: "home" });
    } else {
      ui.setView("build");
    }

    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  };

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage unavailable: this session can still continue */
    }
    setDismissed(true);
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-end justify-center p-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:items-center md:pb-3">
      <div data-testid="tutorial" className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-3xl bg-[#141414]/95 shadow-[0_24px_80px_-20px_rgba(0,0,0,.9)] ring-1 ring-white/15 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gold">{c.eyebrow}</div>
            <div className="mt-0.5 text-base font-black">{c.title}</div>
          </div>
          <button onClick={dismiss} className="flex size-8 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white" aria-label={c.skip}>
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <div key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-gold" : "bg-white/10")} />
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-electric/15 text-sky-200 ring-1 ring-electric/30">
              <Icon className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{c.progress} {step + 1}/{STEPS.length}</div>
              <h2 className="mt-1 text-lg font-black">{text.title[l]}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{text.body[l]}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button onClick={dismiss} className="flex-1 rounded-xl px-3 py-2.5 text-xs font-bold text-white/45 hover:bg-white/5 hover:text-white">
              {c.skip}
            </button>
            <button onClick={go} className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-black text-[#241900] shadow-[0_3px_0_0_#b47700] transition hover:brightness-105 active:translate-y-0.5">
              {step === STEPS.length - 1 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
              {/* the supply step's price goes under its label: side by side they don't fit a phone */}
              <span className="flex flex-col items-start leading-tight">
                <span>{step === STEPS.length - 1 ? c.done : text.action[l]}</span>
                {step === SUPPLY_STEP && supplyCost > 0 && <span className="text-xs font-bold tabular-nums text-[#241900]/70">{formatMoney(supplyCost)}</span>}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
