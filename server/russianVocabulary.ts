// Most frequent Russian words suitable for children learning
// Based on Russian frequency dictionary with child-friendly selections
export interface VocabularyWord {
  russian: string;
  english: string;
  category: string;
  frequencyRank: number;
}

export const russianVocabulary: VocabularyWord[] = [
  // Animals (Животные)
  { russian: "кошка", english: "cat", category: "animals", frequencyRank: 1 },
  { russian: "собака", english: "dog", category: "animals", frequencyRank: 2 },
  { russian: "птица", english: "bird", category: "animals", frequencyRank: 3 },
  { russian: "рыба", english: "fish", category: "animals", frequencyRank: 4 },
  {
    russian: "лошадь",
    english: "horse",
    category: "animals",
    frequencyRank: 5,
  },
  { russian: "корова", english: "cow", category: "animals", frequencyRank: 6 },
  { russian: "свинья", english: "pig", category: "animals", frequencyRank: 7 },
  {
    russian: "курица",
    english: "chicken",
    category: "animals",
    frequencyRank: 8,
  },
  { russian: "мышь", english: "mouse", category: "animals", frequencyRank: 9 },
  {
    russian: "медведь",
    english: "bear",
    category: "animals",
    frequencyRank: 10,
  },

  // Family (Семья)
  { russian: "мама", english: "mom", category: "family", frequencyRank: 11 },
  { russian: "папа", english: "dad", category: "family", frequencyRank: 12 },
  {
    russian: "брат",
    english: "brother",
    category: "family",
    frequencyRank: 13,
  },
  {
    russian: "сестра",
    english: "sister",
    category: "family",
    frequencyRank: 14,
  },
  {
    russian: "бабушка",
    english: "grandma",
    category: "family",
    frequencyRank: 15,
  },
  {
    russian: "дедушка",
    english: "grandpa",
    category: "family",
    frequencyRank: 16,
  },
  { russian: "друг", english: "friend", category: "family", frequencyRank: 17 },
  {
    russian: "ребёнок",
    english: "child",
    category: "family",
    frequencyRank: 18,
  },

  // Food (Еда)
  { russian: "яблоко", english: "apple", category: "food", frequencyRank: 19 },
  { russian: "хлеб", english: "bread", category: "food", frequencyRank: 20 },
  { russian: "молоко", english: "milk", category: "food", frequencyRank: 21 },
  { russian: "вода", english: "water", category: "food", frequencyRank: 22 },
  { russian: "сок", english: "juice", category: "food", frequencyRank: 23 },
  { russian: "банан", english: "banana", category: "food", frequencyRank: 24 },
  { russian: "сыр", english: "cheese", category: "food", frequencyRank: 25 },
  { russian: "яйцо", english: "egg", category: "food", frequencyRank: 26 },
  { russian: "суп", english: "soup", category: "food", frequencyRank: 27 },
  { russian: "торт", english: "cake", category: "food", frequencyRank: 28 },

  // Colors (Цвета)
  { russian: "красный", english: "red", category: "colors", frequencyRank: 29 },
  { russian: "синий", english: "blue", category: "colors", frequencyRank: 30 },
  {
    russian: "зелёный",
    english: "green",
    category: "colors",
    frequencyRank: 31,
  },
  {
    russian: "жёлтый",
    english: "yellow",
    category: "colors",
    frequencyRank: 32,
  },
  { russian: "белый", english: "white", category: "colors", frequencyRank: 33 },
  {
    russian: "чёрный",
    english: "black",
    category: "colors",
    frequencyRank: 34,
  },
  {
    russian: "оранжевый",
    english: "orange",
    category: "colors",
    frequencyRank: 35,
  },
  {
    russian: "розовый",
    english: "pink",
    category: "colors",
    frequencyRank: 36,
  },

  // Numbers (Числа)
  { russian: "один", english: "one", category: "numbers", frequencyRank: 37 },
  { russian: "два", english: "two", category: "numbers", frequencyRank: 38 },
  { russian: "три", english: "three", category: "numbers", frequencyRank: 39 },
  {
    russian: "четыре",
    english: "four",
    category: "numbers",
    frequencyRank: 40,
  },
  { russian: "пять", english: "five", category: "numbers", frequencyRank: 41 },
  { russian: "шесть", english: "six", category: "numbers", frequencyRank: 42 },
  { russian: "семь", english: "seven", category: "numbers", frequencyRank: 43 },
  {
    russian: "восемь",
    english: "eight",
    category: "numbers",
    frequencyRank: 44,
  },
  {
    russian: "девять",
    english: "nine",
    category: "numbers",
    frequencyRank: 45,
  },
  { russian: "десять", english: "ten", category: "numbers", frequencyRank: 46 },

  // Nature (Природа)
  { russian: "солнце", english: "sun", category: "nature", frequencyRank: 47 },
  { russian: "луна", english: "moon", category: "nature", frequencyRank: 48 },
  { russian: "звезда", english: "star", category: "nature", frequencyRank: 49 },
  { russian: "дерево", english: "tree", category: "nature", frequencyRank: 50 },
  {
    russian: "цветок",
    english: "flower",
    category: "nature",
    frequencyRank: 51,
  },
  { russian: "небо", english: "sky", category: "nature", frequencyRank: 52 },
  { russian: "дождь", english: "rain", category: "nature", frequencyRank: 53 },
  { russian: "снег", english: "snow", category: "nature", frequencyRank: 54 },

  // Home (Дом)
  { russian: "дом", english: "house", category: "home", frequencyRank: 55 },
  { russian: "окно", english: "window", category: "home", frequencyRank: 56 },
  { russian: "дверь", english: "door", category: "home", frequencyRank: 57 },
  { russian: "стол", english: "table", category: "home", frequencyRank: 58 },
  { russian: "стул", english: "chair", category: "home", frequencyRank: 59 },
  { russian: "кровать", english: "bed", category: "home", frequencyRank: 60 },
  { russian: "книга", english: "book", category: "home", frequencyRank: 61 },
  { russian: "игрушка", english: "toy", category: "home", frequencyRank: 62 },

  // Body (Тело)
  { russian: "голова", english: "head", category: "body", frequencyRank: 63 },
  { russian: "рука", english: "hand", category: "body", frequencyRank: 64 },
  { russian: "нога", english: "leg", category: "body", frequencyRank: 65 },
  { russian: "глаз", english: "eye", category: "body", frequencyRank: 66 },
  { russian: "нос", english: "nose", category: "body", frequencyRank: 67 },
  { russian: "рот", english: "mouth", category: "body", frequencyRank: 68 },
  { russian: "ухо", english: "ear", category: "body", frequencyRank: 69 },
  { russian: "волосы", english: "hair", category: "body", frequencyRank: 70 },

  // Actions (Действия)
  {
    russian: "есть",
    english: "to eat",
    category: "actions",
    frequencyRank: 71,
  },
  {
    russian: "пить",
    english: "to drink",
    category: "actions",
    frequencyRank: 72,
  },
  {
    russian: "спать",
    english: "to sleep",
    category: "actions",
    frequencyRank: 73,
  },
  {
    russian: "играть",
    english: "to play",
    category: "actions",
    frequencyRank: 74,
  },
  {
    russian: "бегать",
    english: "to run",
    category: "actions",
    frequencyRank: 75,
  },
  {
    russian: "прыгать",
    english: "to jump",
    category: "actions",
    frequencyRank: 76,
  },
  {
    russian: "читать",
    english: "to read",
    category: "actions",
    frequencyRank: 77,
  },
  {
    russian: "писать",
    english: "to write",
    category: "actions",
    frequencyRank: 78,
  },

  // Common words (Общие слова)
  { russian: "да", english: "yes", category: "common", frequencyRank: 79 },
  { russian: "нет", english: "no", category: "common", frequencyRank: 80 },
  {
    russian: "привет",
    english: "hello",
    category: "common",
    frequencyRank: 81,
  },
  { russian: "пока", english: "bye", category: "common", frequencyRank: 82 },
  {
    russian: "спасибо",
    english: "thank you",
    category: "common",
    frequencyRank: 83,
  },
  {
    russian: "пожалуйста",
    english: "please",
    category: "common",
    frequencyRank: 84,
  },
  { russian: "хорошо", english: "good", category: "common", frequencyRank: 85 },
  { russian: "плохо", english: "bad", category: "common", frequencyRank: 86 },
  { russian: "большой", english: "big", category: "common", frequencyRank: 87 },
  {
    russian: "маленький",
    english: "small",
    category: "common",
    frequencyRank: 88,
  },

  // Transport (Транспорт)
  {
    russian: "машина",
    english: "car",
    category: "transport",
    frequencyRank: 89,
  },
  {
    russian: "автобус",
    english: "bus",
    category: "transport",
    frequencyRank: 90,
  },
  {
    russian: "поезд",
    english: "train",
    category: "transport",
    frequencyRank: 91,
  },
  {
    russian: "самолёт",
    english: "airplane",
    category: "transport",
    frequencyRank: 92,
  },
  {
    russian: "велосипед",
    english: "bicycle",
    category: "transport",
    frequencyRank: 93,
  },
  {
    russian: "корабль",
    english: "ship",
    category: "transport",
    frequencyRank: 94,
  },

  // Time (Время)
  { russian: "день", english: "day", category: "time", frequencyRank: 95 },
  { russian: "ночь", english: "night", category: "time", frequencyRank: 96 },
  { russian: "утро", english: "morning", category: "time", frequencyRank: 97 },
  { russian: "вечер", english: "evening", category: "time", frequencyRank: 98 },
  { russian: "сегодня", english: "today", category: "time", frequencyRank: 99 },
  {
    russian: "завтра",
    english: "tomorrow",
    category: "time",
    frequencyRank: 100,
  },
];
