"use client";

import { ArrowRight, Check, Factory, Flag, Hammer, MapPin, Package, X } from "lucide-react";
import { useEffect, useState } from "react";
import { suggestedRestock, unitsInStock, type RestockPlan } from "@/game/engine/materials";
import { formatMoney } from "@/game/format";
import type { GameState } from "@/game/types";
import type { EconomySnapshot } from "@/game/engine/economy";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "idle-car-empire:onboarding-dismissed";

type Step = {
  icon: typeof Factory;
  title: { en: string; ro: string; ru: string };
  body: { en: string; ro: string; ru: string };
  action: { en: string; ro: string; ru: string };
};

const STEPS: Step[] = [
  {
    icon: Factory,
    title: { en: "Start with your factory", ro: "Începe cu fabrica ta", ru: "Начни со своей фабрики" },
    body: {
      en: "Your company already owns a small Body Works. Open it first and learn what it produces, how fast it works and where the materials go.",
      ro: "Compania ta are deja o mică fabrică de caroserii. Deschide-o și vezi ce produce, cât de repede lucrează și unde merg materialele.",
      ru: "У твоей компании уже есть небольшой завод кузовов. Сначала открой его и посмотри, что он производит, как работает и куда идут материалы.",
    },
    action: { en: "Open factory", ro: "Deschide fabrica", ru: "Открыть фабрику" },
  },
  {
    icon: Factory,
    title: { en: "Watch production", ro: "Urmărește producția", ru: "Наблюдай за производством" },
    body: {
      en: "Production is automatic. The factory consumes materials, creates parts and sends them through the supply chain.",
      ro: "Producția este automată. Fabrica consumă materiale, creează componente și le trimite prin lanțul de producție.",
      ru: "Производство автоматическое. Завод использует материалы, выпускает детали и отправляет их по цепочке.",
    },
    action: { en: "Show factory floor", ro: "Vezi hala de producție", ru: "Открыть цех" },
  },
  {
    icon: Package,
    title: { en: "Keep it supplied", ro: "Aprovizionează fabrica", ru: "Снабжай завод" },
    body: {
      en: "A factory without steel stops, and the materials it started with last only a couple of minutes. Buy a few more now. Later, when the goal card asks for materials, buy them in the factory's 📦 MATERIALS menu.",
      ro: "Fără oțel, fabrica se oprește, iar materialele de la început ajung doar câteva minute. Cumpără câteva acum. Mai târziu, când obiectivul de jos cere materiale, le cumperi din meniul 📦 MATERIALE al fabricii.",
      ru: "Без стали завод встаёт, а стартовых материалов хватит лишь на пару минут. Купи ещё немного сейчас. Позже, когда цель внизу попросит материалы, покупай их в меню завода 📦 МАТЕРИАЛЫ.",
    },
    action: { en: "Buy materials", ro: "Cumpără materiale", ru: "Купить материалы" },
  },
  {
    icon: Hammer,
    title: { en: "Build your next factory", ro: "Construiește următoarea fabrică", ru: "Построй следующий завод" },
    body: {
      en: "Your first Body Works is only the beginning. Buy land and build the next production stage when you can afford it. New factories unlock the car supply chain.",
      ro: "Prima fabrică este doar începutul. Cumpără teren și construiește următoarea etapă când îți permiți. Fabricile noi deschid lanțul de producție auto.",
      ru: "Первый завод — только начало. Покупай землю и строй следующий этап, когда хватит денег. Новые заводы открывают автомобильную цепочку.",
    },
    action: { en: "Open Build", ro: "Deschide Construiește", ru: "Открыть строительство" },
  },
  {
    icon: MapPin,
    title: { en: "Grow the empire", ro: "Extinde imperiul", ru: "Расширяй империю" },
    body: {
      en: "Use the map to follow materials, factories, trucks and finished products. Expand district by district instead of spending everything at once.",
      ro: "Folosește harta pentru a urmări materialele, fabricile, camioanele și produsele finite. Extinde-te district cu district.",
      ru: "Используй карту, чтобы следить за материалами, заводами, грузовиками и готовой продукцией. Расширяйся район за районом.",
    },
    action: { en: "Show the map", ro: "Arată harta", ru: "Показать карту" },
  },
  {
    icon: Flag,
    title: { en: "Race when you're ready", ro: "Intră în curse când ești pregătit", ru: "Выходи на гонки, когда будешь готов" },
    body: {
      en: "Racing comes later. First build a stable production business, then use cars, racing and upgrades to turn your factory into an automotive empire.",
      ro: "Cursele vin mai târziu. Mai întâi construiește o producție stabilă, apoi folosește mașinile, cursele și upgrade-urile pentru a transforma fabrica într-un imperiu auto.",
      ru: "Гонки будут позже. Сначала создай стабильное производство, затем используй машины, гонки и улучшения, чтобы превратить завод в автоимперию.",
    },
    action: { en: "Start building", ro: "Începe construcția", ru: "Начать строительство" },
  },
];

const copy = {
  en: { eyebrow: "FIRST COMPANY", title: "Welcome to Idle Car Empire", skip: "Skip tutorial", next: "Next", done: "Start my empire", progress: "Step" },
  ro: { eyebrow: "PRIMA COMPANIE", title: "Bine ai venit în Idle Car Empire", skip: "Sari peste tutorial", next: "Următorul", done: "Începe imperiul", progress: "Pasul" },
  ru: { eyebrow: "ПЕРВАЯ КОМПАНИЯ", title: "Добро пожаловать в Idle Car Empire", skip: "Пропустить обучение", next: "Далее", done: "Начать империю", progress: "Шаг" },
} as const;

function languageOf(lang: string): keyof typeof copy {
  return lang === "ro" || lang === "ru" ? lang : "en";
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
      <div className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-3xl bg-[#141414]/95 shadow-[0_24px_80px_-20px_rgba(0,0,0,.9)] ring-1 ring-white/15 backdrop-blur-xl">
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
