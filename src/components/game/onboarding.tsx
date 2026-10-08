"use client";

import { ArrowRight, Check, Factory, Flag, Hammer, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
      en: "Production is automatic. The factory consumes materials, creates parts and sends them through the supply chain. You manage the business instead of clicking every cycle.",
      ro: "Producția este automată. Fabrica consumă materiale, creează componente și le trimite prin lanțul de producție. Tu conduci afacerea, fără să apeși la fiecare ciclu.",
      ru: "Производство автоматическое. Завод использует материалы, выпускает детали и отправляет их по цепочке. Ты управляешь бизнесом, а не нажимаешь кнопку каждого цикла.",
    },
    action: { en: "Show factory floor", ro: "Vezi hala de producție", ru: "Открыть цех" },
  },
  {
    icon: Hammer,
    title: { en: "Build your next factory", ro: "Construiește următoarea fabrică", ru: "Построй следующий завод" },
    body: {
      en: "Your first Body Works is only the beginning. Buy land and build the next production stage when you can afford it. New factories unlock the car supply chain.",
      ro: "Prima fabrică este doar începutul. Cumpără teren și construiește următoarea etapă când îți permiți. Fabricile noi deschid lanțul de producție auto.",
      ru: "Первый завод — только начало. Покупай землю и строй следующий этап, когда хватит денег. Новые заводы открывают автомобильную цепочку.",
    },
    action: { en: "Open Build", ro: "Deschide Build", ru: "Открыть строительство" },
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

export function Onboarding() {
  const ready = useGame((g) => g.ready);
  const state = useGame((g) => g.state);
  const lang = useGame((g) => g.state.settings.lang);
  const [dismissed, setDismissed] = useState(true);
  const [step, setStep] = useState(0);
  const ui = useUi();

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const firstRun = useMemo(
    () => state.run.playTime < 45 && state.lifetime.playTime < 45 && state.prestigeCount === 0,
    [state.run.playTime, state.lifetime.playTime, state.prestigeCount],
  );

  if (!ready || dismissed || !firstRun) return null;

  const l = languageOf(lang);
  const text = STEPS[step];
  const Icon = text.icon;
  const c = copy[l];

  const go = () => {
    if (step === 0) {
      const starter = Object.keys(state.city.buildings).find((id) => state.city.buildings[id]?.type === "bodyWorks");
      if (starter) ui.selectPlot(starter);
    } else if (step === 1) {
      const starter = Object.keys(state.city.buildings).find((id) => state.city.buildings[id]?.type === "bodyWorks");
      if (starter) ui.openFloor(starter);
    } else if (step === 2) {
      ui.setView("build");
    } else if (step === 3) {
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
              {step === STEPS.length - 1 ? c.done : text.action[l]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
