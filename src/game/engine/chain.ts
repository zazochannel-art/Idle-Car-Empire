// The supply chain. Plants on the map turn raw material into components;
// trucks (real objects with a route and a travel time) carry everything:
// raw material from the Materials Depot, components to the Parts Market or
// to a Car Assembly Plant, finished cars to dealerships. Money only comes in
// when a load is sold at the market or a customer buys a car.
//
// The code lives in ./chain/, one file per part (this file re-exports them, so imports of
// "./chain" keep working).
// plantsOf, plantCount, hasPlant: plants.ts (a leaf every module may use)
export * from "./plants";
export * from "./chain/state";
export * from "./chain/unlocks";
export * from "./chain/travel";
export * from "./chain/cars";
export * from "./chain/stats";
export * from "./chain/road";
export * from "./chain/tick";
export * from "./chain/offline";
export * from "./chain/actions";
export * from "./chain/saves";
