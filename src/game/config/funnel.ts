// The anonymous new-player funnel (supabase/migrations/0006): the steps a
// new company goes through, in order. Each is sent once, as its name and the
// minutes of play it took; nothing identifies the player or the device.
export const FUNNEL_STEPS = ["gate", "start", "firstBody", "engineFactory", "assemblyPlant", "firstCar", "firstSale", "min30", "zone2", "research", "hour3", "racing", "day1", "day7", "imperium"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/** Marks a company from before the funnel existed: it is never counted (it is not a new player). */
export const FUNNEL_LEGACY = "legacy";
