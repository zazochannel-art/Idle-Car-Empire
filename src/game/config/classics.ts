// Rare Classic Barn Finds & Restoration Workshop

export interface ClassicCar {
  id: string;
  name: string;
  year: number;
  emoji: string;
  color: string;
  cost: number;
  ticket: number;
  minutes: number;
  barnLocation: string;
  repairCost: number;
  auctionValue: number;
  description: string;
}

export const MUSEUM_LEVEL_BONUS = 0.05;

export const CLASSICS: ClassicCar[] = [
  {
    id: "arrow55",
    name: "Silver Arrow 1955",
    year: 1955,
    emoji: "🏎️",
    color: "#94a3b8",
    cost: 80_000,
    ticket: 1_200,
    minutes: 5,
    barnLocation: "Hambarul din Valea Veche",
    repairCost: 80_000,
    auctionValue: 450_000,
    description: "Legendă V8 găsită sub o prelată veche în hambar.",
  },
  {
    id: "riviera63",
    name: "Riviera GT 1963",
    year: 1963,
    emoji: "🦅",
    color: "#3b82f6",
    cost: 250_000,
    ticket: 3_500,
    minutes: 15,
    barnLocation: "Hambarul de pe Coasă",
    repairCost: 250_000,
    auctionValue: 1_200_000,
    description: "Uși fluture clasice, necesită recondiționarea completă a motorului.",
  },
  {
    id: "shelby1965",
    name: "Acrobați 1965 Roadster",
    year: 1965,
    emoji: "🏎️",
    color: "#e11d48",
    cost: 80_000,
    ticket: 1_200,
    minutes: 30,
    barnLocation: "Hambarul din Valea Veche",
    repairCost: 80_000,
    auctionValue: 450_000,
    description: "Legendă V8 găsită sub o prelată veche în hambar.",
  },
  {
    id: "gt40_1966",
    name: "Endurance GT40 1966",
    year: 1966,
    emoji: "🏁",
    color: "#eab308",
    cost: 600_000,
    ticket: 9_000,
    minutes: 120,
    barnLocation: "Hambarul Părăsit din Canion",
    repairCost: 600_000,
    auctionValue: 3_500_000,
    description: "Campioană clasică Le Mans găsită în stare brută.",
  },
];

export const CLASSIC_BY_ID: Record<string, ClassicCar> = Object.fromEntries(CLASSICS.map((c) => [c.id, c]));
