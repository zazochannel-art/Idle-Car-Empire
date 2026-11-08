"use client";

import { ArrowRight, Check, Factory, Hammer, MapPin, Package, X } from "lucide-react";
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
    title: { en: "This is your factory", ro: "Aceasta este fabrica ta", ru: "Это твой завод", es: "Esta es tu fábrica", pt: "Esta é a sua fábrica", de: "Das ist dein Werk" },
    body: {
      en: "It builds car bodies on its own. Let's take a look inside.",
      ro: "Ea produce singură caroserii de mașini. Hai să vedem înăuntru.",
      ru: "Он сам делает кузова. Давай заглянем внутрь.",
      es: "Fabrica carrocerías por sí sola. Echemos un vistazo dentro.",
      pt: "Ela faz carrocerias sozinha. Vamos ver por dentro.",
      de: "Es baut ganz allein Karosserien. Sehen wir mal hinein.",
    },
    action: { en: "Open factory", ro: "Deschide fabrica", ru: "Открыть фабрику", es: "Abrir fábrica", pt: "Abrir fábrica", de: "Werk öffnen" },
  },
  {
    icon: Package,
    title: { en: "Give it materials", ro: "Dă-i materiale", ru: "Дай заводу материалы", es: "Dale materiales", pt: "Dê materiais", de: "Versorge es mit Material" },
    body: {
      en: "The factory stops without steel. Buy a bit now. Later, buy more in the factory's 📦 MATERIALS menu.",
      ro: "Fără oțel, fabrica se oprește. Cumpără puțin acum. Mai târziu cumperi din meniul 📦 MATERIALE al fabricii.",
      ru: "Без стали завод встаёт. Купи немного сейчас. Потом покупай в меню завода 📦 МАТЕРИАЛЫ.",
      es: "Sin acero, la fábrica se para. Compra un poco ahora. Más adelante, compra más en el menú 📦 MATERIALES de la fábrica.",
      pt: "Sem aço, a fábrica para. Compre um pouco agora. Depois, compre mais no menu 📦 MATERIAIS da fábrica.",
      de: "Ohne Stahl steht das Werk still. Kauf jetzt etwas. Später kaufst du im Menü 📦 MATERIAL des Werks nach.",
    },
    action: { en: "Buy materials", ro: "Cumpără materiale", ru: "Купить материалы", es: "Comprar materiales", pt: "Comprar materiais", de: "Material kaufen" },
  },
  {
    icon: Hammer,
    title: { en: "Build more factories", ro: "Construiește mai multe fabrici", ru: "Строй новые заводы", es: "Construye más fábricas", pt: "Construa mais fábricas", de: "Bau weitere Werke" },
    body: {
      en: "With more money, buy land and build the next factory. Together they make whole cars.",
      ro: "Când ai bani, cumperi teren și construiești următoarea fabrică. Împreună fac mașini întregi.",
      ru: "Когда хватит денег, купи землю и построй следующий завод. Вместе они делают целые машины.",
      es: "Con más dinero, compra terreno y construye la siguiente fábrica. Juntas fabrican coches enteros.",
      pt: "Com mais dinheiro, compre terreno e construa a próxima fábrica. Juntas, elas fazem carros inteiros.",
      de: "Mit mehr Geld kaufst du Land und baust das nächste Werk. Zusammen bauen sie ganze Autos.",
    },
    action: { en: "Open Build", ro: "Deschide Construiește", ru: "Открыть строительство", es: "Abrir Construir", pt: "Abrir Construir", de: "Bauen öffnen" },
  },
  {
    icon: MapPin,
    title: { en: "Follow it on the map", ro: "Urmărește totul pe hartă", ru: "Следи за всем на карте", es: "Síguelo en el mapa", pt: "Acompanhe no mapa", de: "Verfolge alles auf der Karte" },
    body: {
      en: "The map shows your factories and trucks at work. Grow one step at a time.",
      ro: "Harta îți arată fabricile și camioanele la lucru. Extinde-te pas cu pas.",
      ru: "На карте видно, как работают твои заводы и грузовики. Расширяйся шаг за шагом.",
      es: "El mapa muestra tus fábricas y camiones trabajando. Crece paso a paso.",
      pt: "O mapa mostra suas fábricas e caminhões trabalhando. Cresça um passo de cada vez.",
      de: "Die Karte zeigt deine Werke und Lkw bei der Arbeit. Wachse Schritt für Schritt.",
    },
    action: { en: "Show the map", ro: "Arată harta", ru: "Показать карту", es: "Ver el mapa", pt: "Mostrar o mapa", de: "Karte zeigen" },
  },
];

const copy = {
  en: { eyebrow: "FIRST COMPANY", title: "Welcome to Idle Car Empire", skip: "Skip tutorial", next: "Next", progress: "Step" },
  ro: { eyebrow: "PRIMA COMPANIE", title: "Bine ai venit în Idle Car Empire", skip: "Sari peste tutorial", next: "Următorul", progress: "Pasul" },
  ru: { eyebrow: "ПЕРВАЯ КОМПАНИЯ", title: "Добро пожаловать в Idle Car Empire", skip: "Пропустить обучение", next: "Далее", progress: "Шаг" },
  es: { eyebrow: "PRIMERA EMPRESA", title: "Te damos la bienvenida a Idle Car Empire", skip: "Saltar tutorial", next: "Siguiente", progress: "Paso" },
  pt: { eyebrow: "PRIMEIRA EMPRESA", title: "Boas-vindas ao Idle Car Empire", skip: "Pular tutorial", next: "Próximo", progress: "Passo" },
  de: { eyebrow: "ERSTE FIRMA", title: "Willkommen bei Idle Car Empire", skip: "Tutorial überspringen", next: "Weiter", progress: "Schritt" },
} satisfies Record<Lang, Record<string, string>>;

function languageOf(lang: string): Lang {
  return Object.hasOwn(copy, lang) ? (lang as Lang) : "en";
}

/** The tour step that buys the starter works its next materials. */
const SUPPLY_STEP = 1;
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
    } else if (step === SUPPLY_STEP) {
      // the order the button showed (nothing if the cash can't cover it: the goal card asks again later)
      const order = starterRestock(game.state, game.snap);
      if (order) game.buyPlan(order.plot, order.plan);
      if (starter) ui.selectPlot(starter);
    } else if (step === 2) {
      ui.setView("build");
    } else {
      ui.closeAll();
      ui.map({ kind: "home" });
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
                <span>{text.action[l]}</span>
                {step === SUPPLY_STEP && supplyCost > 0 && <span className="text-xs font-bold tabular-nums text-[#241900]/70">{formatMoney(supplyCost)}</span>}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
