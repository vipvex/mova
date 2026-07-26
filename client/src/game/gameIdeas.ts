/**
 * The 130-game brainstorm master list, encoded as data (mova_minigame_master_list.md).
 * Scores 1-5 each: M(Mute Test) V(Voice-as-Controller) T(Templateability) B(Buildability)
 * R(Repetition Tolerance) L(Learning Density) A(ASR Reliability). Total /35.
 * Tier: S>=30, A 27-29, B 23-26, C<23. HARD RULE: M<=2 => disqualified ("DQ").
 */

export interface GameIdea {
  n: number;
  name: string;
  family: string;
  engine: string;   // best-fit engine (some map to future engines)
  teaches: string;
  M: number; V: number; T: number; B: number; R: number; L: number; A: number;
  total: number;
  tier: "S" | "A" | "B" | "C" | "DQ";
}

// family -> best-fit engine (per the master list's 9-engine consolidation)
const FAM_ENGINE: Record<string, string> = {
  Runner: "runner", Catcher: "catcher", Gate: "gate", Combat: "runner",
  Commander: "commander", Kitchen: "commander", Navigation: "commander",
  Builder: "builder", Spellcast: "builder", Story: "story", Listening: "listener",
  Music: "rhythm", Numbers: "number", Memory: "memory", Physics: "catcher",
  Speed: "rhythm", Conversation: "talk", Wildcard: "wildcard",
};

// [n, name, family, teaches, M,V,T,B,R,L,A]
type Row = [number, string, string, string, number, number, number, number, number, number, number];
const RAW: Row[] = [
  [1,"Obstacle Runner","Runner","action verbs",5,5,5,5,5,4,5],
  [2,"Rooftop Escape","Runner","verbs under panic",5,5,4,4,5,4,5],
  [3,"Lava Floor","Runner","verbs + timer",4,5,4,5,4,4,5],
  [4,"Ski Slalom","Runner","directions",4,5,3,5,5,3,5],
  [5,"Animal Stampede","Runner","verbs + animals",5,5,4,4,4,4,4],
  [6,"Minecart Madness","Runner","brake/faster/jump/duck",5,5,3,4,4,3,5],
  [7,"Jetpack Climb","Runner","up/down",4,5,3,5,4,3,5],
  [8,"Haunted Hall","Runner","freeze / red-light",5,5,3,4,4,3,5],
  [9,"Swim & Dive","Runner","surface/dive verbs",4,5,3,4,4,3,5],
  [10,"Parade March","Runner","listen-then-speak verbs",3,4,4,4,3,4,5],
  [11,"Falling Catch","Catcher","nouns",4,5,5,5,4,5,5],
  [12,"UFO Abduction","Catcher","animals",5,5,5,4,4,5,4],
  [13,"Fishing Frenzy","Catcher","nouns",4,4,5,4,4,5,4],
  [14,"Bubble Pop","Catcher","nouns by category",4,5,5,5,4,5,4],
  [15,"Conveyor Factory","Catcher","nouns at speed",4,5,5,5,4,5,5],
  [16,"Petting Zoo Feed","Catcher","animals",4,4,5,4,3,5,4],
  [17,"Laundry Day","Catcher","clothing",3,4,4,5,3,5,5],
  [18,"Fruit Market Sorter","Catcher","food",3,4,5,5,3,5,5],
  [19,"Trash vs Treasure","Catcher","recall + recognition",3,4,5,5,3,4,5],
  [20,"Mail Sorter","Catcher","categories",3,4,5,5,3,4,4],
  [21,"Three Doors","Gate","colors/adjectives",4,5,5,5,4,4,5],
  [22,"Potion Picker","Gate","adj+noun agreement",4,4,5,4,4,5,4],
  [23,"Tunnel Sizes","Gate","size adjectives",4,5,4,5,4,3,5],
  [24,"Hot/Cold Corridors","Gate","antonyms",4,5,5,5,4,4,5],
  [25,"Costume Gate","Gate","clothing commands",4,4,4,4,3,5,4],
  [26,"Traffic Lights","Gate","agreement",3,4,5,5,3,5,5],
  [27,"Mirror Maze","Gate","descriptors",3,4,4,4,3,4,4],
  [28,"Bridge Fork","Gate","spoken descriptors",4,4,4,5,3,4,5],
  [29,"Counter-Shout Boss","Combat","verbs/counters",5,5,5,4,5,4,5],
  [30,"Wizard Duel","Combat","sentence complexity",5,4,5,3,5,5,3],
  [31,"Word Sword Duel","Combat","antonyms",4,4,5,4,4,5,4],
  [32,"Shadow Boxer","Combat","dodge verbs",4,5,3,4,4,3,5],
  [33,"Dragon Feeder","Combat","food",4,4,5,4,4,5,4],
  [34,"Monster Tamer","Combat","phrases (collection)",4,4,5,3,5,4,4],
  [35,"Snowball Fort","Combat","targets/directions",4,4,4,4,4,4,4],
  [36,"Robot Butler","Commander","phrases",5,5,5,4,5,5,4],
  [37,"Pet Academy","Commander","commands/praise",5,4,5,4,5,4,4],
  [38,"Heist Guide","Commander","commands (whisper)",5,4,4,3,4,4,3],
  [39,"Toy Army","Commander","position commands",5,4,4,3,4,4,4],
  [40,"Ghost Helper","Commander","voice navigation",4,5,4,4,4,4,4],
  [41,"Zoo Keeper","Commander","animals+directions",4,4,5,4,4,5,4],
  [42,"Traffic Controller","Commander","commands",4,5,4,5,4,3,5],
  [43,"Firefighter Dispatch","Commander","sequenced commands",4,4,4,4,3,4,4],
  [44,"Farm Foreman","Commander","chores (persistent)",4,4,5,3,4,4,4],
  [45,"Baby Dino Sitter","Commander","comfort phrases",5,4,4,3,4,4,4],
  [46,"Cooking Rush","Kitchen","verb+noun",5,5,5,3,5,5,4],
  [47,"Pizza Line","Kitchen","food nouns",4,5,5,4,4,5,5],
  [48,"Ice Cream Stacker","Kitchen","flavors+sizes",4,4,5,4,4,4,4],
  [49,"Sandwich Assembly","Kitchen","sequence",4,4,5,4,4,5,4],
  [50,"Café Barista","Kitchen","drinks+modifiers",3,4,5,4,3,5,4],
  [51,"Grocery Dash","Kitchen","food/household",4,4,5,4,4,5,5],
  [52,"Juice Blender","Kitchen","fruit combos",4,4,4,4,3,4,4],
  [53,"Cake Decorator","Kitchen","color+shape+position",4,4,4,3,3,5,4],
  [54,"Rescue Dispatcher","Navigation","directions/preps",4,5,5,4,4,5,4],
  [55,"Treasure Map","Navigation","prepositions",4,4,5,4,4,5,4],
  [56,"Maze Whisperer","Navigation","directions",4,5,4,5,4,4,5],
  [57,"Drone Pilot","Navigation","prepositions",4,5,4,4,4,5,5],
  [58,"Hide & Seek","Navigation","spatial words",4,4,4,4,4,4,4],
  [59,"Parking Valet","Navigation","spatial commands",4,4,4,4,3,4,4],
  [60,"Submarine Sonar","Navigation","depth/direction",4,4,3,4,3,4,5],
  [61,"Bridge Builder","Builder","word order",4,5,5,4,4,5,4],
  [62,"Rocket Countdown","Builder","sentences",4,4,5,5,4,5,4],
  [63,"Train Coupler","Builder","word order",4,4,5,4,4,5,4],
  [64,"Tower of Words","Builder","longer sentences",4,4,5,4,4,5,3],
  [65,"Robot Assembly","Builder","sentence parts",4,4,5,3,4,5,4],
  [66,"Music Box","Builder","word order",3,4,5,4,3,4,4],
  [67,"Domino Chain","Builder","sentence chain",4,4,5,4,3,4,4],
  [68,"Ladder Stacker","Builder","word order",3,4,5,5,3,5,4],
  [69,"Spell Scaling","Spellcast","sentence complexity",5,5,5,4,5,5,3],
  [70,"Garden Grower","Spellcast","descriptive sentences",4,4,5,4,4,5,3],
  [71,"Balloon Inflator","Spellcast","sentence length",4,4,5,5,4,4,3],
  [72,"Weather Wizard","Spellcast","weather+modifiers",4,4,5,4,4,5,4],
  [73,"Genie Wishes","Spellcast","precise sentences",5,4,5,3,4,5,3],
  [74,"Paint-by-Speech","Spellcast","descriptive scene",3,4,5,3,3,5,3],
  [75,"Mad-Lib Theater","Story","open vocab",5,4,5,3,5,5,4],
  [76,"Choose-Your-Adventure","Story","spoken choices",4,4,5,3,4,4,4],
  [77,"Bedtime Story Remix","Story","naming (ritual)",4,4,5,3,4,4,4],
  [78,"News Anchor","Story","fill-the-blanks",4,4,5,4,3,4,4],
  [79,"Comic Creator","Story","speech bubbles",3,4,5,4,3,4,3],
  [80,"Dream Machine","Story","description (image-gen)",4,4,5,3,4,5,2],
  [81,"Simon Says","Listening","comprehension (voice-rest)",4,5,5,5,5,4,5],
  [82,"Spy Password","Listening","connected speech",4,4,5,4,4,5,5],
  [83,"Sound Detective","Listening","recognition",3,4,5,5,4,5,5],
  [84,"Wrong Word Alarm","Listening","comprehension",4,4,5,5,4,5,5],
  [85,"Bingo Caller","Listening","vocab bingo",3,4,5,5,3,4,5],
  [86,"Recipe Listener","Listening","spoken steps",3,4,5,4,3,5,5],
  [87,"Dance Instructor","Listening","movement verbs",4,5,4,4,4,4,5],
  [88,"Telephone Tower","Listening","repetition/relay",3,4,4,4,3,5,4],
  [89,"Karaoke Stage","Music","pronunciation (Suno)",5,4,5,3,5,4,3],
  [90,"Rhythm Chant","Music","pronunciation on beat",4,5,5,4,4,5,3],
  [91,"Echo Song","Music","call-and-response",4,4,5,4,4,4,3],
  [92,"Opera Boss","Music","phonetics (hold vowel)",5,4,3,4,4,2,4],
  [93,"Beatbox Vocab","Music","words on a beat",4,4,4,3,4,3,3],
  [94,"Marching Band","Music","rhythmic commands",3,4,4,4,3,3,4],
  [95,"Market Haggle","Numbers","numbers/money",4,4,5,4,4,5,5],
  [96,"Auction House","Numbers","numbers",4,5,5,5,4,5,5],
  [97,"Cash Register","Numbers","numbers/change",3,4,5,5,3,5,5],
  [98,"Elevator Operator","Numbers","floors/numbers",3,4,4,5,3,4,5],
  [99,"Bank Vault","Numbers","number sequences",3,4,4,5,3,4,5],
  [100,"Lemonade Stand","Numbers","prices (persistent)",4,4,4,4,4,4,5],
  [101,"Voice Memory Match","Memory","any nouns",4,4,5,5,4,5,5],
  [102,"What's Missing?","Memory","nouns",4,4,5,5,4,5,4],
  [103,"X-Ray Scanner","Memory","nouns",4,4,5,5,4,5,4],
  [104,"Password Chain","Memory","working memory",3,4,5,5,4,5,4],
  [105,"I Spy (both ways)","Memory","describe/guess",4,4,5,4,4,5,3],
  [106,"Shadow Match","Memory","nouns (silhouettes)",3,4,5,5,3,5,5],
  [107,"Kim's Shelf","Memory","recall list",3,4,5,5,3,5,4],
  [108,"Catapult Carnival","Physics","name-to-aim",4,4,5,4,4,4,4],
  [109,"Pinball Announcer","Physics","name-to-activate",4,4,4,4,4,3,4],
  [110,"Marble Run Gates","Physics","word gates",4,4,4,4,3,4,4],
  [111,"Bowling Call","Physics","color/number",4,4,4,5,3,3,5],
  [112,"Balloon Darts","Physics","colors",3,4,4,5,3,3,5],
  [113,"Tongue-Twister Time Trial","Speed","pronunciation",4,4,4,5,4,3,3],
  [114,"Repeat-After-Chef","Speed","phrases at speed",3,4,5,4,3,4,4],
  [115,"Syllable Stomp","Speed","syllables",4,4,5,4,4,3,5],
  [116,"Whisper/Shout Meter","Speed","volume mechanic",5,5,3,4,4,2,4],
  [117,"Rapid-Fire Boss","Speed","flashcards (fails Mute Test)",2,3,5,5,2,5,5],
  [118,"Village Talk","Conversation","open dialogue (endgame)",5,4,5,2,5,5,2],
  [119,"Restaurant Roleplay","Conversation","ordering",4,4,5,3,4,5,3],
  [120,"Pen Pal Robot","Conversation","relationship (memory)",4,4,5,3,5,5,2],
  [121,"Interrogation","Conversation","questions",5,4,4,2,4,5,2],
  [122,"Lost Tourist","Conversation","directions",4,4,5,3,4,5,3],
  [123,"Doctor Visit","Conversation","body/feelings",4,4,4,3,3,5,3],
  [124,"Word Gacha","Wildcard","any (collection)",4,3,5,5,5,4,5],
  [125,"Photo Safari","Wildcard","animals (album)",4,4,5,4,4,5,4],
  [126,"Freeze Dance Vocab","Wildcard","any nouns",4,4,5,5,4,5,5],
  [127,"Hot Potato Chain","Wildcard","categories",4,4,5,5,4,5,4],
  [128,"Weather Reporter","Wildcard","real weather (ritual)",3,4,4,4,4,5,4],
  [129,"Emoji Translator","Wildcard","narration",3,4,5,5,3,4,3],
  [130,"Pet Naming Ceremony","Wildcard","3 adjectives",4,4,3,4,2,4,3],
];

function tierOf(M: number, total: number): GameIdea["tier"] {
  if (M <= 2) return "DQ";
  if (total >= 30) return "S";
  if (total >= 27) return "A";
  if (total >= 23) return "B";
  return "C";
}

export const GAME_IDEAS: GameIdea[] = RAW.map(([n, name, family, teaches, M, V, T, B, R, L, A]) => {
  const total = M + V + T + B + R + L + A;
  return { n, name, family, engine: FAM_ENGINE[family] || "wildcard", teaches, M, V, T, B, R, L, A, total, tier: tierOf(M, total) };
});

/** Engines that have a playable scene today (show blue badge, previewable). */
export const BUILT_ENGINES = new Set(["runner", "catcher", "gate", "listener", "commander", "builder", "memory"]);

/** Engines the factory can generate levels for (⚡ Gen button). */
export const FACTORY_ENGINES = new Set(["runner", "catcher", "gate"]);
