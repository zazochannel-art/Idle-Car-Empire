import type { Effect, ResearchCategory } from "../types";

export interface ResearchCategoryConfig {
  id: ResearchCategory;
  name: string;
  emoji: string;
  color: string;
}

export const RESEARCH_CATEGORIES: ResearchCategoryConfig[] = [
  { id: "engineering", name: "Engineering", emoji: "🔧", color: "#60a5fa" },
  { id: "automation", name: "Automation", emoji: "🏭", color: "#22d3ee" },
  { id: "electric", name: "Electric", emoji: "⚡", color: "#a3e635" },
  { id: "ai", name: "AI Manufacturing", emoji: "🤖", color: "#c084fc" },
  { id: "design", name: "Design", emoji: "🎨", color: "#f472b6" },
  { id: "performance", name: "Performance", emoji: "🏎️", color: "#fb923c" },
  { id: "green", name: "Green Technology", emoji: "🌱", color: "#4ade80" },
];

export interface ResearchNode {
  id: string;
  category: ResearchCategory;
  name: string;
  description: string;
  /** Research points. */
  cost: number;
  requires: string[];
  effects: Effect[];
}

export const RESEARCH: ResearchNode[] = [
  // 🔧 Engineering
  { id: "advanced_engines", category: "engineering", name: "Advanced Engines", description: "+25% production value", cost: 5, requires: [], effects: [{ kind: "value", mult: 1.25 }] },
  { id: "turbocharging", category: "engineering", name: "Turbocharging", description: "+25% production speed", cost: 60, requires: ["advanced_engines"], effects: [{ kind: "speed", mult: 1.25 }] },
  { id: "precision_engineering", category: "engineering", name: "Precision Engineering", description: "+60% production value", cost: 2_500, requires: ["turbocharging"], effects: [{ kind: "value", mult: 1.6 }] },
  { id: "modular_platforms", category: "engineering", name: "Modular Platforms", description: "Upgrades cost 15% less", cost: 60_000, requires: ["precision_engineering"], effects: [{ kind: "costMult", mult: 0.85 }] },

  // 🏭 Automation
  { id: "robotic_assembly", category: "automation", name: "Robotic Assembly", description: "+20% production speed", cost: 15, requires: [], effects: [{ kind: "speed", mult: 1.2 }] },
  { id: "smart_conveyors", category: "automation", name: "Smart Conveyors", description: "+40% delivery speed", cost: 150, requires: ["robotic_assembly"], effects: [{ kind: "delivery", mult: 1.4 }] },
  { id: "lights_out", category: "automation", name: "Lights-Out Factory", description: "+50% production speed", cost: 6_000, requires: ["smart_conveyors"], effects: [{ kind: "speed", mult: 1.5 }] },
  { id: "self_replicating", category: "automation", name: "Self-Building Lines", description: "×2 production speed", cost: 250_000, requires: ["lights_out", "ai_factory"], effects: [{ kind: "speed", mult: 2 }] },

  // ⚡ Electric
  { id: "battery_cells", category: "electric", name: "Battery Cells", description: "+20% value on all cars", cost: 400, requires: [], effects: [{ kind: "value", mult: 1.2 }] },
  { id: "electric_motors", category: "electric", name: "Electric Motors", description: "Unlocks Electric Performance cars and the Electric Factory", cost: 20_000, requires: ["battery_cells", "advanced_engines"], effects: [{ kind: "unlockCar", car: "electric" }, { kind: "unlockFactory", factory: "electricFactory" }] },
  { id: "solid_state", category: "electric", name: "Solid-State Batteries", description: "+100% Electric Performance value", cost: 400_000, requires: ["electric_motors"], effects: [{ kind: "value", mult: 2, minTier: 7, maxTier: 7 }] },

  // 🤖 AI Manufacturing
  { id: "ai_factory", category: "ai", name: "AI Factory", description: "+50% offline income", cost: 1_200, requires: ["robotic_assembly"], effects: [{ kind: "offline", add: 0.5 }] },
  { id: "predictive_maintenance", category: "ai", name: "Predictive Maintenance", description: "+30% speed, +4h offline limit", cost: 30_000, requires: ["ai_factory"], effects: [{ kind: "speed", mult: 1.3 }, { kind: "offlineCap", hours: 4 }] },
  { id: "neural_design", category: "ai", name: "Neural Design", description: "Unlocks the Future Car", cost: 2_000_000, requires: ["predictive_maintenance", "electric_motors"], effects: [{ kind: "unlockCar", car: "future" }] },

  // 🎨 Design
  { id: "aerodynamics", category: "design", name: "Aerodynamics", description: "+15% value on all cars", cost: 30, requires: [], effects: [{ kind: "value", mult: 1.15 }] },
  { id: "showroom_experience", category: "design", name: "Showroom Experience", description: "+30% dealer capacity, +10% dealer markup", cost: 800, requires: ["aerodynamics"], effects: [{ kind: "dealerCap", mult: 1.3 }, { kind: "markup", add: 0.1 }] },
  { id: "luxury_interiors", category: "design", name: "Luxury Interiors", description: "+40% value on tier 4+ cars", cost: 12_000, requires: ["showroom_experience"], effects: [{ kind: "value", mult: 1.4, minTier: 4 }] },
  { id: "iconic_styling", category: "design", name: "Iconic Styling", description: "+50% global income", cost: 500_000, requires: ["luxury_interiors"], effects: [{ kind: "income", mult: 1.5 }] },

  // 🏎️ Performance
  { id: "carbon_fiber", category: "performance", name: "Carbon Fiber", description: "+30% sports car value (tiers 4–6)", cost: 1_500, requires: ["advanced_engines"], effects: [{ kind: "value", mult: 1.3, minTier: 4, maxTier: 6 }] },
  { id: "track_telemetry", category: "performance", name: "Track Telemetry", description: "+50% value on tier 5+ cars", cost: 40_000, requires: ["carbon_fiber"], effects: [{ kind: "value", mult: 1.5, minTier: 5 }] },
  { id: "active_aero", category: "performance", name: "Active Aero", description: "+25% speed, +25% delivery", cost: 900_000, requires: ["track_telemetry"], effects: [{ kind: "speed", mult: 1.25 }, { kind: "delivery", mult: 1.25 }] },

  // 🌱 Green Technology
  { id: "recycled_materials", category: "green", name: "Recycled Materials", description: "+10% income, +20% research", cost: 100, requires: [], effects: [{ kind: "income", mult: 1.1 }, { kind: "rp", mult: 1.2 }] },
  { id: "solar_plants", category: "green", name: "Solar Plants", description: "+20% speed, +25% offline income", cost: 4_000, requires: ["recycled_materials"], effects: [{ kind: "speed", mult: 1.2 }, { kind: "offline", add: 0.25 }] },
  { id: "carbon_neutral", category: "green", name: "Carbon Neutral", description: "+30% global income, +4h offline limit", cost: 150_000, requires: ["solar_plants"], effects: [{ kind: "income", mult: 1.3 }, { kind: "offlineCap", hours: 4 }] },
];

export const RESEARCH_BY_ID: Record<string, ResearchNode> = Object.fromEntries(
  RESEARCH.map((r) => [r.id, r]),
);
