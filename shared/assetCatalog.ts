/** The sprites each game expects, with the prompt subject used to (re)generate them.
 *  Drives the Studio "Assets" tab: shows every slot, generated or missing, and the
 *  editable subject fed to POST /api/assets/generate. House style comes from the
 *  style picker there (default "flat-vector"). */

export interface AssetDef {
  key: string;     // logical asset key (underscores only — matches /api/assets/img/:key)
  label: string;   // human name shown on the card
  subject: string; // default prompt subject (editable in the UI before regenerating)
}

export interface AssetPack {
  game: string;
  emoji: string;
  assets: AssetDef[];
}

export const ASSET_PACKS: AssetPack[] = [
  {
    game: "Grandma's Kitchen",
    emoji: "🍳",
    assets: [
      { key: "char_athena", label: "Athena (chef)", subject: "a cheerful little girl chef with a white chef hat and a pink apron" },
      { key: "char_grandma", label: "Grandma", subject: "a kind smiling grandmother with grey hair in a bun, glasses, a blue dress and apron, isometric three-quarter game pose" },
      { key: "ing_apple", label: "Apple (яблоко)", subject: "a single shiny red apple with a small green leaf" },
      { key: "ing_meat", label: "Meat (мясо)", subject: "a fresh raw steak of red meat with white marbling" },
      { key: "ing_bread", label: "Bread (хлеб)", subject: "a golden loaf of crusty bread" },
      { key: "ing_cheese", label: "Cheese (сыр)", subject: "a wedge of yellow swiss cheese with holes" },
      { key: "ing_milk", label: "Milk (молоко)", subject: "a glass bottle of milk, full and white" },
      { key: "ing_fish", label: "Fish (рыба)", subject: "a whole fresh blue-silver fish, side view" },
    ],
  },
  {
    game: "Kitchen Environment (tiles)",
    emoji: "🧱",
    assets: [
      { key: "env_floor", label: "Floor tile (light)", subject: "a single isometric diamond kitchen floor tile (2:1 dimetric rhombus), warm cream ceramic, fills the diamond edge to edge, soft grout on the diamond edges, no square frame" },
      { key: "env_floor_dark", label: "Floor tile (dark)", subject: "a single isometric diamond kitchen floor tile (2:1 dimetric rhombus), warm honey-tan ceramic, fills the diamond edge to edge, soft grout on the diamond edges, slightly darker than the cream tile" },
      { key: "env_wall", label: "Wall / counter edge", subject: "a single isometric diamond wooden kitchen counter tile (2:1 dimetric rhombus), warm oak planks, fills the diamond edge to edge, soft rounded rim" },
      { key: "env_counter", label: "Station pad", subject: "a single isometric diamond butcher-block serving board tile (2:1 dimetric rhombus), light maple wood, fills the diamond edge to edge, soft rounded rim" },
    ],
  },
];
