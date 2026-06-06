// Learning curricula — Lexical-sprint structure, one tree per language.
// Philosophy: 500+ nouns + 100+ verbs before any real grammar so the learner
// reaches combinatorial fluency as fast as possible (Lewis Lexical Approach,
// Pimsleur critical-mass, Fluent Forever image-meaning).
//
// Order: Foundation 20 → 6 noun sprints → essential adjectives → verb sprint
// → combination glue → (everything abstract: numbers, time, aspect, connectives).
//
// SPANISH_CURRICULUM mirrors RUSSIAN_CURRICULUM's phases/subthemes/goals exactly
// (a "port-and-swap"), with words replaced by their Spanish-natural equivalents.
// Notable structural adjustments forced by the language: Russian aspect-pair
// doublets (дать/давать) collapse to one Spanish verb and the freed slots are
// backfilled; the his/her/their possessives (его/её/их) collapse to "su";
// ser vs estar is split out explicitly. Gender is carried in the English gloss
// (e.g. "(f)") so the bare lemma in `word` still matches the vocabulary join.

export type CurriculumWord = { word: string; english: string };

export type CurriculumSubtheme = {
  name: string;
  words: CurriculumWord[];
};

export type CurriculumPhase = {
  phase: number;
  name: string;
  goal: string;
  color: string;
  subthemes: CurriculumSubtheme[];
};

const w = (word: string, english: string): CurriculumWord => ({ word, english });

export const RUSSIAN_CURRICULUM: CurriculumPhase[] = [
  {
    phase: 0,
    name: "Foundation 20",
    goal: "The 20 words you literally cannot combine anything without. After these, any noun is already productive.",
    color: "stone",
    subthemes: [
      {
        name: "The 20 (pronouns + want/can/have + key questions + hi/yes/no)",
        words: [
          w("я", "I"), w("ты", "you"), w("он", "he"), w("она", "she"),
          w("мой", "my"), w("твой", "your"),
          w("это", "this is"), w("вот", "here is"),
          w("да", "yes"), w("нет", "no"), w("не", "not"),
          w("хотеть", "to want"), w("мочь", "can"), w("есть", "to have / there is"),
          w("и", "and"),
          w("кто", "who"), w("что", "what"), w("где", "where"),
          w("привет", "hi"), w("спасибо", "thanks"),
        ],
      },
    ],
  },
  {
    phase: 1,
    name: "People & Body",
    goal: "Every person around you, every body part. Pure nouns — point and name.",
    color: "amber",
    subthemes: [
      {
        name: "Family",
        words: [
          w("мама", "mom"), w("папа", "dad"),
          w("бабушка", "grandma"), w("дедушка", "grandpa"),
          w("брат", "brother"), w("сестра", "sister"),
          w("сын", "son"), w("дочь", "daughter"),
          w("мать", "mother"), w("отец", "father"),
          w("муж", "husband"), w("жена", "wife"),
          w("семья", "family"),
          w("дядя", "uncle"), w("тётя", "aunt"),
          w("внук", "grandson"), w("внучка", "granddaughter"),
          w("ребёнок", "child"), w("малыш", "little one"),
          w("родитель", "parent"),
        ],
      },
      {
        name: "Roles & people",
        words: [
          w("мальчик", "boy"), w("девочка", "girl"),
          w("мужчина", "man"), w("женщина", "woman"),
          w("человек", "person"),
          w("друг", "friend (m)"), w("подруга", "friend (f)"),
          w("приятель", "buddy"),
          w("доктор", "doctor"),
          w("учитель", "teacher (m)"), w("учительница", "teacher (f)"),
          w("гость", "guest"), w("сосед", "neighbor"),
          w("ребята", "guys / kids"),
          w("принцесса", "princess"),
        ],
      },
      {
        name: "More pronouns",
        words: [
          w("мы", "we"), w("вы", "you (pl)"), w("они", "they"),
          w("наш", "our"), w("его", "his"), w("её", "her"),
          w("их", "their"), w("сам", "oneself"), w("имя", "name"),
        ],
      },
      {
        name: "Face & head",
        words: [
          w("голова", "head"), w("лицо", "face"),
          w("глаз", "eye"), w("ухо", "ear"), w("нос", "nose"),
          w("рот", "mouth"), w("зуб", "tooth"),
          w("волос", "hair"), w("губа", "lip"),
          w("щека", "cheek"), w("лоб", "forehead"),
          w("шея", "neck"), w("голос", "voice"),
          w("улыбка", "smile"), w("слеза", "tear"),
        ],
      },
      {
        name: "Limbs & torso",
        words: [
          w("плечо", "shoulder"), w("рука", "hand / arm"),
          w("палец", "finger"), w("спина", "back"),
          w("живот", "stomach"), w("бок", "side"),
          w("нога", "leg / foot"), w("пятка", "heel"),
          w("стопа", "foot"), w("лопатка", "shoulder blade"),
          w("борода", "beard"),
        ],
      },
      {
        name: "Inside the body & care",
        words: [
          w("сердце", "heart"), w("кровь", "blood"),
          w("кожа", "skin"), w("тело", "body"),
          w("сон", "sleep / dream"),
          w("хвост", "tail"), w("лапа", "paw"),
          w("болезнь", "illness"), w("рана", "wound"),
          w("лекарство", "medicine"), w("таблетка", "pill"),
        ],
      },
    ],
  },
  {
    phase: 2,
    name: "Food & Drink",
    goal: "Everything edible. All nouns — pure point-at-it vocabulary, no recipes yet.",
    color: "orange",
    subthemes: [
      {
        name: "Basics",
        words: [
          w("еда", "food"), w("хлеб", "bread"),
          w("вода", "water"), w("молоко", "milk"),
          w("чай", "tea"), w("сок", "juice"),
          w("суп", "soup"), w("каша", "porridge"),
          w("мясо", "meat"), w("рыба", "fish"),
          w("яйцо", "egg"), w("масло", "butter / oil"),
          w("сыр", "cheese"), w("сахар", "sugar"),
          w("соль", "salt"), w("мука", "flour"),
        ],
      },
      {
        name: "Fruits & vegetables",
        words: [
          w("фрукт", "fruit"), w("овощ", "vegetable"),
          w("яблоко", "apple"), w("банан", "banana"),
          w("апельсин", "orange"), w("лимон", "lemon"),
          w("груша", "pear"), w("виноград", "grape"),
          w("арбуз", "watermelon"), w("ягода", "berry"),
          w("картошка", "potato"), w("огурец", "cucumber"),
          w("помидор", "tomato"), w("капуста", "cabbage"),
          w("лук", "onion"), w("орех", "nut"),
        ],
      },
      {
        name: "Sweets & treats",
        words: [
          w("мёд", "honey"), w("конфета", "candy"),
          w("шоколад", "chocolate"), w("мороженое", "ice cream"),
          w("пирог", "pie"), w("торт", "cake"),
          w("пирожок", "small pie"), w("бутерброд", "sandwich"),
          w("печенье", "cookie"), w("варенье", "jam"),
          w("салат", "salad"),
        ],
      },
      {
        name: "Meals & portions",
        words: [
          w("завтрак", "breakfast"), w("обед", "lunch"),
          w("ужин", "dinner"), w("напиток", "drink"),
          w("кусок", "piece"), w("крошка", "crumb"),
          w("колбаса", "sausage"), w("шашлык", "kebab"),
          w("рис", "rice"), w("блин", "pancake"),
        ],
      },
      {
        name: "Tableware",
        words: [
          w("тарелка", "plate"), w("чашка", "cup"),
          w("кружка", "mug"), w("стакан", "glass"),
          w("ложка", "spoon"), w("вилка", "fork"),
          w("нож", "knife"), w("чайник", "kettle"),
          w("кастрюля", "pot"), w("миска", "bowl"),
        ],
      },
    ],
  },
  {
    phase: 3,
    name: "Animals & Nature",
    goal: "Every animal a kid can name + the natural world around them.",
    color: "emerald",
    subthemes: [
      {
        name: "Pets & farm animals",
        words: [
          w("собака", "dog"), w("кот", "cat (m)"), w("кошка", "cat (f)"),
          w("щенок", "puppy"), w("котёнок", "kitten"),
          w("лошадь", "horse"), w("конь", "stallion"),
          w("корова", "cow"), w("свинья", "pig"),
          w("курица", "hen"), w("петух", "rooster"),
          w("утка", "duck"), w("гусь", "goose"),
          w("овца", "sheep"), w("коза", "goat"), w("козёл", "billy goat"),
          w("осёл", "donkey"), w("кролик", "rabbit"),
        ],
      },
      {
        name: "Wild animals",
        words: [
          w("волк", "wolf"), w("медведь", "bear"),
          w("лиса", "fox"), w("заяц", "hare"),
          w("слон", "elephant"), w("тигр", "tiger"),
          w("обезьяна", "monkey"), w("крокодил", "crocodile"),
          w("змея", "snake"), w("акула", "shark"),
          w("черепаха", "turtle"), w("белка", "squirrel"),
          w("ёжик", "hedgehog"),
        ],
      },
      {
        name: "Birds, bugs, sea",
        words: [
          w("птица", "bird"), w("ворона", "crow"),
          w("сова", "owl"), w("воробей", "sparrow"),
          w("голубь", "pigeon"), w("попугай", "parrot"),
          w("муха", "fly"), w("комар", "mosquito"),
          w("пчела", "bee"), w("муравей", "ant"),
          w("жук", "beetle"), w("бабочка", "butterfly"),
          w("червь", "worm"), w("лягушка", "frog"),
          w("рак", "crayfish"), w("животное", "animal"),
          w("зверь", "beast"), w("насекомое", "insect"),
        ],
      },
      {
        name: "Animal body parts",
        words: [
          w("рог", "horn"), w("коготь", "claw"),
          w("клюв", "beak"), w("паутина", "spider web"),
        ],
      },
      {
        name: "Sky & celestial",
        words: [
          w("земля", "earth / land"), w("небо", "sky"),
          w("солнце", "sun"), w("луна", "moon"),
          w("звезда", "star"), w("облако", "cloud"),
          w("туча", "rain cloud"),
        ],
      },
      {
        name: "Plants & landscape",
        words: [
          w("дерево", "tree"), w("лес", "forest"),
          w("трава", "grass"), w("цветок", "flower"),
          w("лист", "leaf"), w("ветка", "branch"),
          w("сосна", "pine"), w("пень", "stump"),
          w("роза", "rose"), w("шишка", "pine cone"),
          w("листок", "small leaf"),
        ],
      },
      {
        name: "Water & weather elements",
        words: [
          w("огонь", "fire"), w("дождь", "rain"),
          w("снег", "snow"), w("лёд", "ice"),
          w("ветер", "wind"), w("камень", "stone"),
          w("песок", "sand"), w("грязь", "mud"),
          w("лужа", "puddle"), w("туман", "fog"),
          w("капля", "drop"), w("мороз", "frost"),
          w("дым", "smoke"), w("гром", "thunder"),
          w("молния", "lightning"), w("радуга", "rainbow"),
          w("гроза", "thunderstorm"), w("град", "hail"),
        ],
      },
    ],
  },
  {
    phase: 4,
    name: "Home & Things",
    goal: "Every room, every household object — most words a kid will ever need around the house.",
    color: "teal",
    subthemes: [
      {
        name: "Rooms & house parts",
        words: [
          w("дом", "house / home"), w("комната", "room"),
          w("кухня", "kitchen"), w("спальня", "bedroom"),
          w("ванная", "bathroom"), w("туалет", "toilet"),
          w("столовая", "dining room"), w("балкон", "balcony"),
          w("этаж", "floor (storey)"), w("крыльцо", "porch"),
          w("лестница", "stairs"),
        ],
      },
      {
        name: "Doors, walls, windows",
        words: [
          w("дверь", "door"), w("окно", "window"),
          w("окошко", "little window"), w("стена", "wall"),
          w("пол", "floor"), w("потолок", "ceiling"),
        ],
      },
      {
        name: "Furniture",
        words: [
          w("стол", "table"), w("стул", "chair"),
          w("кровать", "bed"), w("диван", "couch"),
          w("шкаф", "wardrobe"), w("полка", "shelf"),
          w("зеркало", "mirror"), w("лампа", "lamp"),
          w("лампочка", "bulb"), w("штора", "curtain"),
          w("тумбочка", "nightstand"), w("табуретка", "stool"),
          w("буфет", "buffet"),
        ],
      },
      {
        name: "Bedroom & bathroom things",
        words: [
          w("подушка", "pillow"), w("одеяло", "blanket"),
          w("постель", "bedding"), w("простыня", "sheet"),
          w("душ", "shower"), w("ванна", "bathtub"),
          w("раковина", "sink"), w("кран", "faucet"),
          w("унитаз", "toilet bowl"), w("мыло", "soap"),
          w("полотенце", "towel"), w("щётка", "brush"),
          w("горшок", "potty"),
        ],
      },
      {
        name: "Kitchen things",
        words: [
          w("холодильник", "fridge"), w("плита", "stove"),
          w("печь", "oven"), w("посуда", "dishes"),
        ],
      },
      {
        name: "Containers & small objects",
        words: [
          w("бутылка", "bottle"), w("банка", "jar"),
          w("коробка", "box"), w("ящик", "drawer"),
          w("мешок", "sack"), w("ведро", "bucket"),
          w("корзина", "basket"), w("пакет", "bag"),
          w("свеча", "candle"), w("стекло", "glass (material)"),
          w("крышка", "lid"), w("ручка", "handle / pen"),
          w("кнопка", "button"), w("пробка", "cork / cap"),
          w("звонок", "doorbell"), w("будильник", "alarm clock"),
          w("часы", "clock / watch"), w("салфетка", "napkin"),
        ],
      },
      {
        name: "Around the house outside",
        words: [
          w("двор", "yard"), w("сад", "garden"),
          w("забор", "fence"), w("ферма", "farm"),
          w("скамейка", "bench"), w("дача", "country house"),
          w("аквариум", "aquarium"), w("ёлка", "fir tree"),
          w("огород", "vegetable garden"),
        ],
      },
      {
        name: "Tools & misc",
        words: [
          w("молоток", "hammer"), w("игла", "needle"),
          w("иголка", "small needle"), w("лопата", "shovel"),
          w("клей", "glue"), w("краска", "paint"),
          w("ковёр", "carpet"), w("пятно", "stain"),
        ],
      },
    ],
  },
  {
    phase: 5,
    name: "Outside World",
    goal: "Clothes, toys, school, transport, public places. The world beyond home.",
    color: "sky",
    subthemes: [
      {
        name: "Clothes",
        words: [
          w("одежда", "clothes"), w("рубашка", "shirt"),
          w("футболка", "t-shirt"), w("майка", "tank top"),
          w("платье", "dress"), w("юбка", "skirt"),
          w("штаны", "pants"), w("брюки", "trousers"),
          w("джинсы", "jeans"), w("куртка", "jacket"),
          w("шуба", "fur coat"), w("свитер", "sweater"),
          w("халат", "robe"), w("рукав", "sleeve"),
        ],
      },
      {
        name: "Hats & shoes",
        words: [
          w("шапка", "hat"), w("шляпа", "wide-brim hat"),
          w("ботинок", "boot"), w("туфля", "shoe"),
          w("обувь", "footwear"), w("носок", "sock"),
          w("чулок", "stocking"), w("валенок", "felt boot"),
          w("перчатка", "glove"),
        ],
      },
      {
        name: "Accessories",
        words: [
          w("сумка", "bag"), w("рюкзак", "backpack"),
          w("очки", "glasses"), w("маска", "mask"),
          w("зонтик", "umbrella"),
        ],
      },
      {
        name: "Toys & play",
        words: [
          w("игрушка", "toy"), w("кукла", "doll"),
          w("мяч", "ball"), w("кубик", "block"),
          w("конструктор", "construction set"),
          w("игра", "game"), w("спорт", "sport"),
          w("прогулка", "walk"), w("подарок", "gift"),
          w("сюрприз", "surprise"), w("сказка", "fairy tale"),
          w("дракон", "dragon"), w("монстр", "monster"),
          w("чудовище", "creature"), w("приз", "prize"),
          w("вечеринка", "party"), w("цирк", "circus"),
          w("барабан", "drum"), w("гитара", "guitar"),
          w("футбол", "soccer"), w("плавание", "swimming"),
        ],
      },
      {
        name: "School & art",
        words: [
          w("школа", "school"), w("класс", "class"),
          w("книга", "book"), w("буква", "letter"),
          w("карандаш", "pencil"), w("тетрадь", "notebook"),
          w("портфель", "satchel"), w("парта", "desk"),
          w("мел", "chalk"), w("рисунок", "drawing"),
          w("музыка", "music"), w("песня", "song"),
          w("танец", "dance"), w("задание", "task"),
          w("урок", "lesson"), w("ученик", "student"),
          w("алфавит", "alphabet"), w("рассказ", "story"),
        ],
      },
      {
        name: "Transport",
        words: [
          w("машина", "car"), w("автобус", "bus"),
          w("поезд", "train"), w("самолёт", "airplane"),
          w("велосипед", "bicycle"), w("такси", "taxi"),
          w("грузовик", "truck"), w("вертолёт", "helicopter"),
          w("ракета", "rocket"), w("сани", "sled"),
          w("коляска", "stroller"), w("колесо", "wheel"),
          w("руль", "steering wheel"), w("светофор", "traffic light"),
          w("билет", "ticket"), w("поездка", "trip"),
        ],
      },
      {
        name: "Public places",
        words: [
          w("улица", "street"), w("дорога", "road"),
          w("мост", "bridge"), w("парк", "park"),
          w("магазин", "store"), w("больница", "hospital"),
          w("поле", "field"), w("пляж", "beach"),
          w("бассейн", "pool"), w("зоопарк", "zoo"),
          w("фонтан", "fountain"), w("водопад", "waterfall"),
        ],
      },
    ],
  },
  {
    phase: 6,
    name: "Senses, Sounds & Tech",
    goal: "Sounds, sensations, daily-life nouns the kid bumps into all the time.",
    color: "indigo",
    subthemes: [
      {
        name: "Sounds & sensations",
        words: [
          w("шум", "noise"), w("звук", "sound"),
          w("свет", "light"), w("тень", "shadow"),
          w("запах", "smell"), w("дым", "smoke"),
          w("стук", "knock"), w("эхо", "echo"),
        ],
      },
      {
        name: "Tech & screens",
        words: [
          w("телефон", "phone"), w("компьютер", "computer"),
          w("телевизор", "TV"), w("экран", "screen"),
          w("фильм", "movie"), w("кино", "cinema"),
          w("видео", "video"), w("фотография", "photo"),
          w("ролик", "video clip"), w("робот", "robot"),
          w("трубка", "phone handset"), w("сериал", "TV series"),
          w("плеер", "music player"), w("мобильник", "mobile phone"),
        ],
      },
      {
        name: "Animal-sound verbs (introduced as nouns-of-sound first)",
        words: [
          w("мяу", "meow"), w("гав", "woof"),
          w("ав-ав", "woof-woof"), w("бах", "bang"),
          w("бум", "boom"),
        ],
      },
      {
        name: "Animals — sound verbs",
        words: [
          w("мяукать", "to meow"), w("гавкать", "to bark (colloq.)"),
          w("лаять", "to bark"), w("хрюкать", "to oink"),
          w("кукарекать", "to crow"), w("рычать", "to growl / roar"),
          w("мычать", "to moo"), w("чирикать", "to chirp"),
          w("квакать", "to croak"), w("кудахтать", "to cluck"),
        ],
      },
      {
        name: "Feelings as nouns",
        words: [
          w("любовь", "love"), w("радость", "joy"),
          w("улыбка", "smile"), w("смех", "laughter"),
          w("шутка", "joke"), w("надежда", "hope"),
          w("мечта", "dream"), w("дружба", "friendship"),
          w("обида", "grievance"), w("страх", "fear"),
        ],
      },
      {
        name: "Misc concrete",
        words: [
          w("вещь", "thing"), w("штука", "thingy"),
          w("бумага", "paper"), w("секрет", "secret"),
          w("шар", "ball / sphere"), w("круг", "circle"),
          w("стрелка", "arrow"), w("пузырь", "bubble"),
          w("глина", "clay"), w("пух", "down / fluff"),
          w("ком", "lump"), w("дыра", "hole"),
          w("яма", "pit"), w("огонёк", "small light"),
        ],
      },
    ],
  },
  {
    phase: 7,
    name: "Essential Adjectives (50)",
    goal: "The smallest adjective set that unlocks 'red cat, big house, hot soup' across the entire noun inventory.",
    color: "violet",
    subthemes: [
      {
        name: "Size & quantity",
        words: [
          w("большой", "big"), w("маленький", "small"),
          w("длинный", "long"), w("короткий", "short"),
          w("высокий", "tall"), w("низкий", "low"),
          w("толстый", "thick"), w("тонкий", "thin"),
        ],
      },
      {
        name: "Quality",
        words: [
          w("хороший", "good"), w("плохой", "bad"),
          w("красивый", "beautiful"), w("страшный", "scary"),
        ],
      },
      {
        name: "Temperature & state",
        words: [
          w("горячий", "hot"), w("тёплый", "warm"),
          w("холодный", "cold"),
          w("мокрый", "wet"), w("чистый", "clean"), w("грязный", "dirty"),
          w("новый", "new"), w("старый", "old"),
        ],
      },
      {
        name: "Brightness & taste",
        words: [
          w("светлый", "light"), w("тёмный", "dark"), w("яркий", "bright"),
          w("сладкий", "sweet"), w("вкусный", "tasty"),
        ],
      },
      {
        name: "Texture & feel",
        words: [
          w("мягкий", "soft"), w("твёрдый", "hard"),
          w("пушистый", "fluffy"),
        ],
      },
      {
        name: "Character & feeling",
        words: [
          w("добрый", "kind"), w("злой", "mean"),
          w("милый", "cute"), w("смешной", "funny"),
          w("весёлый", "cheerful"), w("грустный", "sad"),
        ],
      },
      {
        name: "Belonging & speed",
        words: [
          w("свой", "one's own"), w("любимый", "favorite"),
          w("родной", "native / dear"), w("детский", "child's"),
          w("быстрый", "fast"), w("медленный", "slow"),
          w("тихий", "quiet"), w("громкий", "loud"),
        ],
      },
      {
        name: "Colors",
        words: [
          w("белый", "white"), w("чёрный", "black"),
          w("красный", "red"), w("зелёный", "green"),
          w("синий", "blue"), w("голубой", "light blue"),
          w("жёлтый", "yellow"), w("оранжевый", "orange"),
          w("розовый", "pink"), w("коричневый", "brown"),
          w("серый", "gray"), w("золотой", "golden"),
          w("цвет", "color"),
        ],
      },
    ],
  },
  {
    phase: 8,
    name: "Verb Sprint (100)",
    goal: "All high-frequency action verbs. Once these are in, a kid can describe almost anything they do.",
    color: "fuchsia",
    subthemes: [
      {
        name: "Existing, being, having (covered in Phase 0 — review)",
        words: [
          w("быть", "to be"), w("есть", "to have / there is"),
        ],
      },
      {
        name: "Core daily verbs",
        words: [
          w("делать", "to do"), w("идти", "to go (on foot)"),
          w("ходить", "to walk / go around"),
          w("видеть", "to see"), w("смотреть", "to watch"),
          w("слышать", "to hear"), w("слушать", "to listen"),
          w("говорить", "to speak"), w("сказать", "to say"),
          w("знать", "to know"), w("думать", "to think"),
          w("любить", "to love"), w("нравиться", "to please / like"),
        ],
      },
      {
        name: "Eating, drinking, sleeping",
        words: [
          w("кушать", "to eat (kid)"), w("пить", "to drink"),
          w("кормить", "to feed"),
          w("спать", "to sleep"), w("заснуть", "to fall asleep"),
          w("проснуться", "to wake up"),
          w("вставать", "to get up"), w("ложиться", "to lie down"),
          w("умываться", "to wash face"), w("мыться", "to wash"),
          w("чистить", "to clean"), w("мыть", "to wash (sth)"),
        ],
      },
      {
        name: "Hands & objects",
        words: [
          w("дать", "to give"), w("давать", "to give (impf)"),
          w("взять", "to take"), w("брать", "to take (impf)"),
          w("держать", "to hold"), w("искать", "to look for"),
          w("найти", "to find"), w("терять", "to lose"),
          w("открыть", "to open"), w("закрыть", "to close"),
          w("поднять", "to lift"), w("принести", "to bring"),
          w("положить", "to put"), w("класть", "to put (impf)"),
          w("бросать", "to throw"), w("кидать", "to throw (colloq.)"),
          w("ловить", "to catch"), w("поймать", "to catch (pf)"),
          w("трогать", "to touch"), w("гладить", "to stroke"),
          w("резать", "to cut"), w("ломать", "to break"),
        ],
      },
      {
        name: "Movement",
        words: [
          w("бежать", "to run (one-way)"),
          w("бегать", "to run around"),
          w("прыгать", "to jump"),
          w("сидеть", "to sit"), w("стоять", "to stand"),
          w("ехать", "to go (by vehicle)"), w("ездить", "to drive around"),
          w("летать", "to fly"), w("плавать", "to swim"),
          w("нырять", "to dive"), w("кататься", "to ride / roll"),
          w("падать", "to fall"), w("прятаться", "to hide"),
          w("расти", "to grow"), w("вырасти", "to grow up"),
        ],
      },
      {
        name: "Social actions",
        words: [
          w("играть", "to play"), w("читать", "to read"),
          w("писать", "to write"), w("рисовать", "to draw"),
          w("петь", "to sing"), w("танцевать", "to dance"),
          w("помогать", "to help"), w("дарить", "to give a gift"),
          w("обнимать", "to hug"), w("обнять", "to hug (pf)"),
          w("целовать", "to kiss"), w("делиться", "to share"),
          w("дружить", "to be friends"), w("звать", "to call"),
        ],
      },
      {
        name: "Voice & emotion verbs",
        words: [
          w("плакать", "to cry"), w("смеяться", "to laugh"),
          w("улыбаться", "to smile"), w("кричать", "to shout"),
          w("шептать", "to whisper"), w("стучать", "to knock"),
          w("ждать", "to wait"), w("спрашивать", "to ask"),
          w("отвечать", "to answer"), w("просить", "to request"),
        ],
      },
      {
        name: "Dressing, carrying",
        words: [
          w("надеть", "to put on (pf)"), w("надевать", "to put on"),
          w("одеть", "to dress sb"), w("одевать", "to dress sb (impf)"),
          w("носить", "to wear / carry"), w("нести", "to carry (one-way)"),
        ],
      },
    ],
  },
  {
    phase: 9,
    name: "Combination Glue",
    goal: "Prepositions, more modals, question words, and basic adverbs. Now sentences truly compose.",
    color: "rose",
    subthemes: [
      {
        name: "Modals & structure",
        words: [
          w("надо", "need to"), w("нужно", "necessary"),
          w("можно", "one may"), w("нельзя", "one mustn't"),
          w("должен", "must"), w("уже", "already"),
          w("ещё", "still / yet"), w("всё", "everything"),
          w("конечно", "of course"), w("кажется", "it seems"),
        ],
      },
      {
        name: "Spatial prepositions",
        words: [
          w("в", "in / into"), w("на", "on / onto"),
          w("по", "along"), w("к", "toward"),
          w("из", "out of"), w("у", "at"),
          w("от", "from"), w("до", "until"),
          w("под", "under"), w("над", "over"),
          w("за", "behind"), w("перед", "in front of"),
          w("около", "near"), w("рядом", "next to"),
        ],
      },
      {
        name: "Directional adverbs",
        words: [
          w("тут", "here"), w("там", "there"),
          w("здесь", "here"), w("туда", "to there"),
          w("сюда", "to here"), w("вверх", "up"),
          w("вниз", "down"), w("назад", "back"),
          w("вперёд", "forward"), w("дальше", "further"),
          w("близко", "close"), w("далеко", "far"),
        ],
      },
      {
        name: "Question words",
        words: [
          w("как", "how"), w("почему", "why"),
          w("когда", "when"), w("куда", "where to"),
          w("откуда", "from where"), w("сколько", "how many"),
          w("какой", "which"), w("чей", "whose"),
        ],
      },
      {
        name: "Connectives",
        words: [
          w("а", "and / but"), w("но", "but"),
          w("или", "or"), w("же", "emphasis"),
          w("тоже", "also"), w("потому что", "because"),
          w("если", "if"), w("чтобы", "in order to"),
        ],
      },
      {
        name: "Intensity & manner adverbs",
        words: [
          w("очень", "very"), w("так", "so"),
          w("много", "many"), w("мало", "few"),
          w("немного", "a little"),
          w("хорошо", "well"), w("плохо", "badly"),
          w("быстро", "fast"), w("тихо", "quietly"),
          w("громко", "loudly"), w("вместе", "together"),
          w("только", "only"),
        ],
      },
    ],
  },
];

export const SPANISH_CURRICULUM: CurriculumPhase[] = [
  {
    phase: 0,
    name: "Foundation 20",
    goal: "The 20 words you literally cannot combine anything without. After these, any noun is already productive.",
    color: "stone",
    subthemes: [
      {
        name: "The 20 (pronouns + want/can/have + key questions + hi/yes/no)",
        words: [
          w("yo", "I"), w("tú", "you"), w("él", "he"), w("ella", "she"),
          w("mi", "my"), w("tu", "your"),
          w("esto", "this is"), w("aquí", "here is"),
          w("sí", "yes"), w("no", "no / not"),
          w("querer", "to want"), w("poder", "can"), w("tener", "to have"),
          w("hay", "there is"),
          w("y", "and"),
          w("quién", "who"), w("qué", "what"), w("dónde", "where"),
          w("hola", "hi"), w("gracias", "thanks"),
        ],
      },
    ],
  },
  {
    phase: 1,
    name: "People & Body",
    goal: "Every person around you, every body part. Pure nouns — point and name.",
    color: "amber",
    subthemes: [
      {
        name: "Family",
        words: [
          w("mamá", "mom"), w("papá", "dad"),
          w("abuela", "grandma"), w("abuelo", "grandpa"),
          w("hermano", "brother"), w("hermana", "sister"),
          w("hijo", "son"), w("hija", "daughter"),
          w("madre", "mother"), w("padre", "father"),
          w("esposo", "husband"), w("esposa", "wife"),
          w("familia", "family"),
          w("tío", "uncle"), w("tía", "aunt"),
          w("nieto", "grandson"), w("nieta", "granddaughter"),
          w("niño", "child"), w("bebé", "baby / little one"),
          w("pariente", "relative"),
        ],
      },
      {
        name: "Roles & people",
        words: [
          w("chico", "boy"), w("chica", "girl"),
          w("hombre", "man"), w("mujer", "woman"),
          w("persona", "person"),
          w("amigo", "friend (m)"), w("amiga", "friend (f)"),
          w("compañero", "buddy"),
          w("doctor", "doctor"),
          w("maestro", "teacher (m)"), w("maestra", "teacher (f)"),
          w("invitado", "guest"), w("vecino", "neighbor"),
          w("chicos", "guys / kids"),
          w("princesa", "princess"),
        ],
      },
      {
        name: "More pronouns",
        words: [
          w("nosotros", "we"), w("vosotros", "you (pl)"), w("ellos", "they"),
          w("nuestro", "our"), w("vuestro", "your (pl)"), w("su", "his / her / their"),
          w("mismo", "oneself"), w("nombre", "name"), w("todos", "everyone"),
        ],
      },
      {
        name: "Face & head",
        words: [
          w("cabeza", "head"), w("cara", "face"),
          w("ojo", "eye"), w("oreja", "ear"), w("nariz", "nose"),
          w("boca", "mouth"), w("diente", "tooth"),
          w("pelo", "hair"), w("labio", "lip"),
          w("mejilla", "cheek"), w("frente", "forehead"),
          w("cuello", "neck"), w("voz", "voice"),
          w("sonrisa", "smile"), w("lágrima", "tear"),
        ],
      },
      {
        name: "Limbs & torso",
        words: [
          w("hombro", "shoulder"), w("mano", "hand"),
          w("brazo", "arm"), w("dedo", "finger"),
          w("espalda", "back"), w("barriga", "belly"),
          w("lado", "side"), w("pierna", "leg"),
          w("pie", "foot"), w("talón", "heel"),
          w("rodilla", "knee"), w("barba", "beard"),
        ],
      },
      {
        name: "Inside the body & care",
        words: [
          w("corazón", "heart"), w("sangre", "blood"),
          w("piel", "skin"), w("cuerpo", "body"),
          w("sueño", "sleep / dream"),
          w("cola", "tail"), w("pata", "paw"),
          w("enfermedad", "illness"), w("herida", "wound"),
          w("medicina", "medicine"), w("pastilla", "pill"),
        ],
      },
    ],
  },
  {
    phase: 2,
    name: "Food & Drink",
    goal: "Everything edible. All nouns — pure point-at-it vocabulary, no recipes yet.",
    color: "orange",
    subthemes: [
      {
        name: "Basics",
        words: [
          w("comida", "food"), w("pan", "bread"),
          w("agua", "water"), w("leche", "milk"),
          w("té", "tea"), w("jugo", "juice"),
          w("sopa", "soup"), w("papilla", "porridge"),
          w("carne", "meat"), w("pescado", "fish"),
          w("huevo", "egg"), w("mantequilla", "butter"),
          w("queso", "cheese"), w("azúcar", "sugar"),
          w("sal", "salt"), w("harina", "flour"),
        ],
      },
      {
        name: "Fruits & vegetables",
        words: [
          w("fruta", "fruit"), w("verdura", "vegetable"),
          w("manzana", "apple"), w("plátano", "banana"),
          w("naranja", "orange"), w("limón", "lemon"),
          w("pera", "pear"), w("uva", "grape"),
          w("sandía", "watermelon"), w("baya", "berry"),
          w("papa", "potato"), w("pepino", "cucumber"),
          w("tomate", "tomato"), w("repollo", "cabbage"),
          w("cebolla", "onion"), w("nuez", "nut"),
        ],
      },
      {
        name: "Sweets & treats",
        words: [
          w("miel", "honey"), w("caramelo", "candy"),
          w("chocolate", "chocolate"), w("helado", "ice cream"),
          w("pastel", "pie"), w("tarta", "cake"),
          w("empanada", "small pie"), w("sándwich", "sandwich"),
          w("galleta", "cookie"), w("mermelada", "jam"),
          w("ensalada", "salad"),
        ],
      },
      {
        name: "Meals & portions",
        words: [
          w("desayuno", "breakfast"), w("almuerzo", "lunch"),
          w("cena", "dinner"), w("bebida", "drink"),
          w("trozo", "piece"), w("miga", "crumb"),
          w("salchicha", "sausage"), w("pincho", "kebab"),
          w("arroz", "rice"), w("panqueque", "pancake"),
        ],
      },
      {
        name: "Tableware",
        words: [
          w("plato", "plate"), w("taza", "cup"),
          w("jarra", "mug"), w("vaso", "glass"),
          w("cuchara", "spoon"), w("tenedor", "fork"),
          w("cuchillo", "knife"), w("tetera", "kettle"),
          w("olla", "pot"), w("cuenco", "bowl"),
        ],
      },
    ],
  },
  {
    phase: 3,
    name: "Animals & Nature",
    goal: "Every animal a kid can name + the natural world around them.",
    color: "emerald",
    subthemes: [
      {
        name: "Pets & farm animals",
        words: [
          w("perro", "dog"), w("gato", "cat (m)"), w("gata", "cat (f)"),
          w("cachorro", "puppy"), w("gatito", "kitten"),
          w("caballo", "horse"), w("yegua", "mare"),
          w("vaca", "cow"), w("cerdo", "pig"),
          w("gallina", "hen"), w("gallo", "rooster"),
          w("pato", "duck"), w("ganso", "goose"),
          w("oveja", "sheep"), w("cabra", "goat"), w("chivo", "billy goat"),
          w("burro", "donkey"), w("conejo", "rabbit"),
        ],
      },
      {
        name: "Wild animals",
        words: [
          w("lobo", "wolf"), w("oso", "bear"),
          w("zorro", "fox"), w("liebre", "hare"),
          w("elefante", "elephant"), w("tigre", "tiger"),
          w("mono", "monkey"), w("cocodrilo", "crocodile"),
          w("serpiente", "snake"), w("tiburón", "shark"),
          w("tortuga", "turtle"), w("ardilla", "squirrel"),
          w("erizo", "hedgehog"),
        ],
      },
      {
        name: "Birds, bugs, sea",
        words: [
          w("pájaro", "bird"), w("cuervo", "crow"),
          w("búho", "owl"), w("gorrión", "sparrow"),
          w("paloma", "pigeon"), w("loro", "parrot"),
          w("mosca", "fly"), w("mosquito", "mosquito"),
          w("abeja", "bee"), w("hormiga", "ant"),
          w("escarabajo", "beetle"), w("mariposa", "butterfly"),
          w("gusano", "worm"), w("rana", "frog"),
          w("cangrejo", "crab"), w("animal", "animal"),
          w("bestia", "beast"), w("insecto", "insect"),
        ],
      },
      {
        name: "Animal body parts",
        words: [
          w("cuerno", "horn"), w("garra", "claw"),
          w("pico", "beak"), w("telaraña", "spider web"),
        ],
      },
      {
        name: "Sky & celestial",
        words: [
          w("tierra", "earth / land"), w("cielo", "sky"),
          w("sol", "sun"), w("luna", "moon"),
          w("estrella", "star"), w("nube", "cloud"),
          w("nubarrón", "rain cloud"),
        ],
      },
      {
        name: "Plants & landscape",
        words: [
          w("árbol", "tree"), w("bosque", "forest"),
          w("hierba", "grass"), w("flor", "flower"),
          w("hoja", "leaf"), w("rama", "branch"),
          w("pino", "pine"), w("tocón", "stump"),
          w("rosa", "rose"), w("piña", "pine cone"),
          w("hojita", "small leaf"),
        ],
      },
      {
        name: "Water & weather elements",
        words: [
          w("fuego", "fire"), w("lluvia", "rain"),
          w("nieve", "snow"), w("hielo", "ice"),
          w("viento", "wind"), w("piedra", "stone"),
          w("arena", "sand"), w("barro", "mud"),
          w("charco", "puddle"), w("niebla", "fog"),
          w("gota", "drop"), w("escarcha", "frost"),
          w("humo", "smoke"), w("trueno", "thunder"),
          w("rayo", "lightning"), w("arcoíris", "rainbow"),
          w("tormenta", "thunderstorm"), w("granizo", "hail"),
        ],
      },
    ],
  },
  {
    phase: 4,
    name: "Home & Things",
    goal: "Every room, every household object — most words a kid will ever need around the house.",
    color: "teal",
    subthemes: [
      {
        name: "Rooms & house parts",
        words: [
          w("casa", "house / home"), w("cuarto", "room"),
          w("cocina", "kitchen"), w("dormitorio", "bedroom"),
          w("baño", "bathroom"), w("aseo", "toilet"),
          w("comedor", "dining room"), w("balcón", "balcony"),
          w("piso", "floor (storey)"), w("porche", "porch"),
          w("escalera", "stairs"),
        ],
      },
      {
        name: "Doors, walls, windows",
        words: [
          w("puerta", "door"), w("ventana", "window"),
          w("ventanita", "little window"), w("pared", "wall"),
          w("suelo", "floor"), w("techo", "ceiling"),
        ],
      },
      {
        name: "Furniture",
        words: [
          w("mesa", "table"), w("silla", "chair"),
          w("cama", "bed"), w("sofá", "couch"),
          w("armario", "wardrobe"), w("estante", "shelf"),
          w("espejo", "mirror"), w("lámpara", "lamp"),
          w("bombilla", "bulb"), w("cortina", "curtain"),
          w("mesita", "nightstand"), w("taburete", "stool"),
          w("aparador", "buffet"),
        ],
      },
      {
        name: "Bedroom & bathroom things",
        words: [
          w("almohada", "pillow"), w("manta", "blanket"),
          w("edredón", "duvet"), w("sábana", "sheet"),
          w("ducha", "shower"), w("bañera", "bathtub"),
          w("lavabo", "sink"), w("grifo", "faucet"),
          w("inodoro", "toilet bowl"), w("jabón", "soap"),
          w("toalla", "towel"), w("cepillo", "brush"),
          w("orinal", "potty"),
        ],
      },
      {
        name: "Kitchen things",
        words: [
          w("nevera", "fridge"), w("estufa", "stove"),
          w("horno", "oven"), w("vajilla", "dishes"),
        ],
      },
      {
        name: "Containers & small objects",
        words: [
          w("botella", "bottle"), w("frasco", "jar"),
          w("caja", "box"), w("cajón", "drawer"),
          w("saco", "sack"), w("cubo", "bucket"),
          w("cesta", "basket"), w("bolsa", "bag"),
          w("vela", "candle"), w("vidrio", "glass (material)"),
          w("tapa", "lid"), w("mango", "handle"),
          w("botón", "button"), w("corcho", "cork / cap"),
          w("timbre", "doorbell"), w("despertador", "alarm clock"),
          w("reloj", "clock / watch"), w("servilleta", "napkin"),
        ],
      },
      {
        name: "Around the house outside",
        words: [
          w("patio", "yard"), w("jardín", "garden"),
          w("valla", "fence"), w("granja", "farm"),
          w("banco", "bench"), w("cabaña", "country house"),
          w("acuario", "aquarium"), w("abeto", "fir tree"),
          w("huerto", "vegetable garden"),
        ],
      },
      {
        name: "Tools & misc",
        words: [
          w("martillo", "hammer"), w("aguja", "needle"),
          w("agujita", "small needle"), w("pala", "shovel"),
          w("pegamento", "glue"), w("pintura", "paint"),
          w("alfombra", "carpet"), w("mancha", "stain"),
        ],
      },
    ],
  },
  {
    phase: 5,
    name: "Outside World",
    goal: "Clothes, toys, school, transport, public places. The world beyond home.",
    color: "sky",
    subthemes: [
      {
        name: "Clothes",
        words: [
          w("ropa", "clothes"), w("camisa", "shirt"),
          w("camiseta", "t-shirt"), w("top", "tank top"),
          w("vestido", "dress"), w("falda", "skirt"),
          w("pantalón", "pants"), w("short", "shorts"),
          w("vaqueros", "jeans"), w("chaqueta", "jacket"),
          w("abrigo", "coat"), w("suéter", "sweater"),
          w("bata", "robe"), w("manga", "sleeve"),
        ],
      },
      {
        name: "Hats & shoes",
        words: [
          w("gorro", "hat"), w("sombrero", "wide-brim hat"),
          w("bota", "boot"), w("zapato", "shoe"),
          w("calzado", "footwear"), w("calcetín", "sock"),
          w("media", "stocking"), w("zapatilla", "slipper"),
          w("guante", "glove"),
        ],
      },
      {
        name: "Accessories",
        words: [
          w("bolso", "bag"), w("mochila", "backpack"),
          w("gafas", "glasses"), w("máscara", "mask"),
          w("paraguas", "umbrella"),
        ],
      },
      {
        name: "Toys & play",
        words: [
          w("juguete", "toy"), w("muñeca", "doll"),
          w("pelota", "ball"), w("bloque", "block"),
          w("construcción", "construction set"),
          w("juego", "game"), w("deporte", "sport"),
          w("paseo", "walk"), w("regalo", "gift"),
          w("sorpresa", "surprise"), w("cuento", "fairy tale"),
          w("dragón", "dragon"), w("monstruo", "monster"),
          w("criatura", "creature"), w("premio", "prize"),
          w("fiesta", "party"), w("circo", "circus"),
          w("tambor", "drum"), w("guitarra", "guitar"),
          w("fútbol", "soccer"), w("natación", "swimming"),
        ],
      },
      {
        name: "School & art",
        words: [
          w("escuela", "school"), w("clase", "class"),
          w("libro", "book"), w("letra", "letter"),
          w("lápiz", "pencil"), w("cuaderno", "notebook"),
          w("cartera", "satchel"), w("pupitre", "desk"),
          w("tiza", "chalk"), w("dibujo", "drawing"),
          w("música", "music"), w("canción", "song"),
          w("baile", "dance"), w("tarea", "task"),
          w("lección", "lesson"), w("alumno", "student"),
          w("alfabeto", "alphabet"), w("relato", "story"),
        ],
      },
      {
        name: "Transport",
        words: [
          w("coche", "car"), w("autobús", "bus"),
          w("tren", "train"), w("avión", "airplane"),
          w("bicicleta", "bicycle"), w("taxi", "taxi"),
          w("camión", "truck"), w("helicóptero", "helicopter"),
          w("cohete", "rocket"), w("trineo", "sled"),
          w("cochecito", "stroller"), w("rueda", "wheel"),
          w("volante", "steering wheel"), w("semáforo", "traffic light"),
          w("billete", "ticket"), w("viaje", "trip"),
        ],
      },
      {
        name: "Public places",
        words: [
          w("calle", "street"), w("carretera", "road"),
          w("puente", "bridge"), w("parque", "park"),
          w("tienda", "store"), w("hospital", "hospital"),
          w("campo", "field"), w("playa", "beach"),
          w("piscina", "pool"), w("zoológico", "zoo"),
          w("fuente", "fountain"), w("cascada", "waterfall"),
        ],
      },
    ],
  },
  {
    phase: 6,
    name: "Senses, Sounds & Tech",
    goal: "Sounds, sensations, daily-life nouns the kid bumps into all the time.",
    color: "indigo",
    subthemes: [
      {
        name: "Sounds & sensations",
        words: [
          w("ruido", "noise"), w("sonido", "sound"),
          w("luz", "light"), w("sombra", "shadow"),
          w("olor", "smell"), w("humo", "smoke"),
          w("golpe", "knock"), w("eco", "echo"),
        ],
      },
      {
        name: "Tech & screens",
        words: [
          w("teléfono", "phone"), w("computadora", "computer"),
          w("televisor", "TV"), w("pantalla", "screen"),
          w("película", "movie"), w("cine", "cinema"),
          w("video", "video"), w("foto", "photo"),
          w("clip", "video clip"), w("robot", "robot"),
          w("auricular", "phone handset"), w("serie", "TV series"),
          w("reproductor", "music player"), w("móvil", "mobile phone"),
        ],
      },
      {
        name: "Animal-sound verbs (introduced as nouns-of-sound first)",
        words: [
          w("miau", "meow"), w("guau", "woof"),
          w("guau-guau", "woof-woof"), w("bang", "bang"),
          w("bum", "boom"),
        ],
      },
      {
        name: "Animals — sound verbs",
        words: [
          w("maullar", "to meow"), w("ladrar", "to bark"),
          w("gruñir", "to growl / oink"), w("rugir", "to roar"),
          w("mugir", "to moo"), w("piar", "to chirp"),
          w("croar", "to croak"), w("cacarear", "to cluck"),
          w("relinchar", "to neigh"), w("aullar", "to howl"),
        ],
      },
      {
        name: "Feelings as nouns",
        words: [
          w("amor", "love"), w("alegría", "joy"),
          w("sonrisa", "smile"), w("risa", "laughter"),
          w("chiste", "joke"), w("esperanza", "hope"),
          w("sueño", "dream"), w("amistad", "friendship"),
          w("enfado", "grievance"), w("miedo", "fear"),
        ],
      },
      {
        name: "Misc concrete",
        words: [
          w("cosa", "thing"), w("cosita", "thingy"),
          w("papel", "paper"), w("secreto", "secret"),
          w("esfera", "ball / sphere"), w("círculo", "circle"),
          w("flecha", "arrow"), w("burbuja", "bubble"),
          w("arcilla", "clay"), w("pelusa", "down / fluff"),
          w("bulto", "lump"), w("agujero", "hole"),
          w("hoyo", "pit"), w("lucecita", "small light"),
        ],
      },
    ],
  },
  {
    phase: 7,
    name: "Essential Adjectives (50)",
    goal: "The smallest adjective set that unlocks 'red cat, big house, hot soup' across the entire noun inventory.",
    color: "violet",
    subthemes: [
      {
        name: "Size & quantity",
        words: [
          w("grande", "big"), w("pequeño", "small"),
          w("largo", "long"), w("corto", "short"),
          w("alto", "tall"), w("bajo", "low"),
          w("grueso", "thick"), w("delgado", "thin"),
        ],
      },
      {
        name: "Quality",
        words: [
          w("bueno", "good"), w("malo", "bad"),
          w("hermoso", "beautiful"), w("espantoso", "scary"),
        ],
      },
      {
        name: "Temperature & state",
        words: [
          w("caliente", "hot"), w("tibio", "warm"),
          w("frío", "cold"),
          w("mojado", "wet"), w("limpio", "clean"), w("sucio", "dirty"),
          w("nuevo", "new"), w("viejo", "old"),
        ],
      },
      {
        name: "Brightness & taste",
        words: [
          w("claro", "light"), w("oscuro", "dark"), w("brillante", "bright"),
          w("dulce", "sweet"), w("rico", "tasty"),
        ],
      },
      {
        name: "Texture & feel",
        words: [
          w("suave", "soft"), w("duro", "hard"),
          w("esponjoso", "fluffy"),
        ],
      },
      {
        name: "Character & feeling",
        words: [
          w("amable", "kind"), w("malvado", "mean"),
          w("lindo", "cute"), w("gracioso", "funny"),
          w("alegre", "cheerful"), w("triste", "sad"),
        ],
      },
      {
        name: "Belonging & speed",
        words: [
          w("propio", "one's own"), w("favorito", "favorite"),
          w("querido", "dear"), w("infantil", "child's"),
          w("rápido", "fast"), w("lento", "slow"),
          w("silencioso", "quiet"), w("ruidoso", "loud"),
        ],
      },
      {
        name: "Colors",
        words: [
          w("blanco", "white"), w("negro", "black"),
          w("rojo", "red"), w("verde", "green"),
          w("azul", "blue"), w("celeste", "light blue"),
          w("amarillo", "yellow"), w("naranja", "orange"),
          w("rosa", "pink"), w("marrón", "brown"),
          w("gris", "gray"), w("dorado", "golden"),
          w("color", "color"),
        ],
      },
    ],
  },
  {
    phase: 8,
    name: "Verb Sprint (100)",
    goal: "All high-frequency action verbs. Once these are in, a kid can describe almost anything they do.",
    color: "fuchsia",
    subthemes: [
      {
        name: "Existing, being, having (ser vs estar + tener)",
        words: [
          w("ser", "to be (essence)"), w("estar", "to be (state)"),
          w("tener", "to have"),
        ],
      },
      {
        name: "Core daily verbs",
        words: [
          w("hacer", "to do"), w("ir", "to go"),
          w("caminar", "to walk"),
          w("ver", "to see"), w("mirar", "to watch"),
          w("oír", "to hear"), w("escuchar", "to listen"),
          w("hablar", "to speak"), w("decir", "to say"),
          w("saber", "to know"), w("pensar", "to think"),
          w("amar", "to love"), w("gustar", "to please / like"),
          w("necesitar", "to need"), w("usar", "to use"),
          w("vivir", "to live"), w("empezar", "to start"),
          w("terminar", "to finish"),
        ],
      },
      {
        name: "Eating, drinking, sleeping",
        words: [
          w("comer", "to eat"), w("beber", "to drink"),
          w("alimentar", "to feed"),
          w("dormir", "to sleep"), w("dormirse", "to fall asleep"),
          w("despertarse", "to wake up"),
          w("levantarse", "to get up"), w("acostarse", "to lie down"),
          w("lavarse", "to wash up"), w("bañarse", "to bathe"),
          w("limpiar", "to clean"), w("lavar", "to wash (sth)"),
        ],
      },
      {
        name: "Hands & objects",
        words: [
          w("dar", "to give"), w("tomar", "to take"),
          w("sostener", "to hold"), w("buscar", "to look for"),
          w("encontrar", "to find"), w("perder", "to lose"),
          w("abrir", "to open"), w("cerrar", "to close"),
          w("levantar", "to lift"), w("traer", "to bring"),
          w("poner", "to put"), w("lanzar", "to throw"),
          w("atrapar", "to catch"), w("tocar", "to touch"),
          w("acariciar", "to stroke"), w("cortar", "to cut"),
          w("romper", "to break"), w("agarrar", "to grab"),
          w("soltar", "to let go"), w("guardar", "to put away"),
          w("empujar", "to push"), w("mostrar", "to show"),
        ],
      },
      {
        name: "Movement",
        words: [
          w("correr", "to run"),
          w("saltar", "to jump"),
          w("sentarse", "to sit"), w("pararse", "to stand"),
          w("conducir", "to drive"), w("volar", "to fly"),
          w("nadar", "to swim"), w("bucear", "to dive"),
          w("montar", "to ride"), w("caer", "to fall"),
          w("esconderse", "to hide"), w("crecer", "to grow"),
          w("trepar", "to climb"), w("gatear", "to crawl"),
          w("resbalar", "to slip"),
        ],
      },
      {
        name: "Social actions",
        words: [
          w("jugar", "to play"), w("leer", "to read"),
          w("escribir", "to write"), w("dibujar", "to draw"),
          w("cantar", "to sing"), w("bailar", "to dance"),
          w("ayudar", "to help"), w("regalar", "to give a gift"),
          w("abrazar", "to hug"), w("besar", "to kiss"),
          w("compartir", "to share"), w("llamar", "to call"),
          w("saludar", "to greet"), w("invitar", "to invite"),
        ],
      },
      {
        name: "Voice & emotion verbs",
        words: [
          w("llorar", "to cry"), w("reír", "to laugh"),
          w("sonreír", "to smile"), w("gritar", "to shout"),
          w("susurrar", "to whisper"), w("golpear", "to knock"),
          w("esperar", "to wait"), w("preguntar", "to ask"),
          w("responder", "to answer"), w("pedir", "to request"),
        ],
      },
      {
        name: "Dressing, carrying",
        words: [
          w("ponerse", "to put on"), w("vestir", "to dress sb"),
          w("vestirse", "to get dressed"), w("llevar", "to wear / carry"),
          w("cargar", "to carry"), w("quitarse", "to take off"),
        ],
      },
    ],
  },
  {
    phase: 9,
    name: "Combination Glue",
    goal: "Prepositions, more modals, question words, and basic adverbs. Now sentences truly compose.",
    color: "rose",
    subthemes: [
      {
        name: "Modals & structure",
        words: [
          w("hay que", "need to"), w("necesario", "necessary"),
          w("se puede", "one may"), w("no se debe", "one mustn't"),
          w("deber", "must"), w("ya", "already"),
          w("todavía", "still / yet"), w("todo", "everything"),
          w("claro", "of course"), w("parece", "it seems"),
        ],
      },
      {
        name: "Spatial prepositions",
        words: [
          w("en", "in / on"), w("sobre", "on / onto"),
          w("por", "along / by"), w("hacia", "toward"),
          w("de", "of / from"), w("desde", "from"),
          w("hasta", "until"), w("bajo", "under"),
          w("encima", "over"), w("detrás", "behind"),
          w("delante", "in front of"), w("junto", "next to"),
          w("entre", "between"), w("contra", "against"),
        ],
      },
      {
        name: "Directional adverbs",
        words: [
          w("aquí", "here"), w("ahí", "there"),
          w("allí", "over there"), w("arriba", "up"),
          w("abajo", "down"), w("atrás", "back"),
          w("adelante", "forward"), w("afuera", "outside"),
          w("adentro", "inside"), w("cerca", "close"),
          w("lejos", "far"), w("alrededor", "around"),
        ],
      },
      {
        name: "Question words",
        words: [
          w("cómo", "how"), w("por qué", "why"),
          w("cuándo", "when"), w("adónde", "where to"),
          w("de dónde", "from where"), w("cuánto", "how many"),
          w("cuál", "which"), w("de quién", "whose"),
        ],
      },
      {
        name: "Connectives",
        words: [
          w("pero", "but"), w("o", "or"),
          w("pues", "then / so"), w("también", "also"),
          w("porque", "because"), w("si", "if"),
          w("para", "in order to"), w("aunque", "although"),
        ],
      },
      {
        name: "Intensity & manner adverbs",
        words: [
          w("muy", "very"), w("tan", "so"),
          w("mucho", "many"), w("poco", "few"),
          w("un poco", "a little"),
          w("bien", "well"), w("mal", "badly"),
          w("rápido", "fast"), w("despacio", "slowly"),
          w("fuerte", "loudly"), w("juntos", "together"),
          w("solo", "only"),
        ],
      },
    ],
  },
];

export const CURRICULA: Record<string, CurriculumPhase[]> = {
  russian: RUSSIAN_CURRICULUM,
  spanish: SPANISH_CURRICULUM,
};

export function totalCurriculumWords(curriculum: CurriculumPhase[]): number {
  const seen = new Set<string>();
  for (const p of curriculum) {
    for (const s of p.subthemes) {
      for (const word of s.words) seen.add(word.word.toLowerCase().trim());
    }
  }
  return seen.size;
}
