# Spanish Curriculum Parity with Russian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Spanish to full parity with the comprehensive Russian curriculum across all four content layers: (1) a scored frequency dictionary, (2) a hand-authored curriculum tree, (3) a populated vocabulary deck, and (4) media (images; audio is on-demand). Today Spanish has 100 vocab rows (56 images, 0 audio), **0** frequency-dictionary rows, and an **empty** curriculum (`[]`). Russian has 738 vocab rows, 10,022 fully-tiered dictionary words, and a 10-phase / ~500-word `RUSSIAN_CURRICULUM`.

**Chosen approach (per product decision):** **Port the Russian structure, swap the words.** `SPANISH_CURRICULUM` mirrors `RUSSIAN_CURRICULUM`'s 10 phases, subtheme names, goals, and colors exactly; each Russian word is replaced with its Spanish-natural equivalent. This guarantees structural parity and reuses every downstream consumer unchanged.

**Why this is mostly wiring + content, not new infrastructure:** The platform is already bilingual. [shared/schema.ts:6](shared/schema.ts#L6) defines `languageEnum = ["russian","spanish"]`; `vocabulary`, `frequency_dictionary`, `stories`, etc. are all language-tagged. [score-frequency-dictionary.ts](script/score-frequency-dictionary.ts) already takes a `language` arg. TTS ([tts.ts:9](server/tts.ts#L9)) notes the Rachel voice "works for RU + ES" and is S3-cached on-demand. Image generation (`gpt-image-2` → S3) is language-agnostic. **The only Russian-hardcoded spots are [routes.ts:313](server/routes.ts#L313) and [routes.ts:2694](server/routes.ts#L2694):** `language === "russian" ? RUSSIAN_CURRICULUM : []`.

**Tech Stack:** TypeScript, Drizzle/Postgres, Express, `@anthropic-ai/sdk` (scoring, Haiku), OpenAI `gpt-image-2` (images), ElevenLabs (TTS), `@aws-sdk/client-s3`.

**Note on TDD:** This repo has no test runner. Per the existing plan convention, each task ends with explicit manual verification (DB queries / `curl` / page check) rather than added test infrastructure.

---

## Open decisions to confirm before/while building

1. **Noun-gender convention in the curriculum tree.** Russian stores the bare lemma (`яблоко` → "apple"). For Spanish, gender is pedagogically important. **Recommendation:** keep the `word` field as the bare lemma (`manzana`) to match the Russian structure and the vocab-resolution join (which lowercases and trims `targetWord`), and encode gender in the `english` gloss where helpful (`"apple (f)"`). This avoids storing articles in `targetWord`, which would break the curriculum→vocabulary match. **Confirm or override.**
2. **Frequency-list source (Layer 1).** Need a ~10k Spanish list with `word`, english gloss, rank, and ideally POS + category. Candidates: a SUBTLEX-ESP / OpenSubtitles-derived frequency list, or the same source family used for the Russian 10k. **Confirm the source** so licensing and gloss quality are acceptable. (Layers 0 and 2 do **not** depend on this and can ship first.)

---

## Structural mapping caveats (Russian → Spanish)

The 10-phase skeleton ports cleanly, but these per-phase substitutions need linguistic judgment, not 1:1 translation:

- **Aspect pairs collapse.** Russian lists imperfective/perfective doublets (`дать`/`давать`, `взять`/`брать`, `надеть`/`надевать`). Spanish has no aspect pairs — each collapses to **one** verb (`dar`, `tomar/coger`, `ponerse`). The freed slots should be backfilled with other high-value Spanish verbs so phase counts stay comparable.
- **Possessives/pronouns simplify.** `его/её/их` → `su/sus`; `ты/вы` formality differs (`tú`/`usted`/`vosotros`). Keep the kid-natural set (`yo, tú, él, ella, nosotros, ellos`).
- **Prepositions don't map 1:1.** Russian `в/на` (in/on) and case-driven directionals map onto Spanish `en/a/sobre/de`, plus `ser` vs `estar` is implicit. Author Phase 9 from the Spanish preposition inventory, keeping the subtheme names.
- **Animal sounds** (Phase 6): `мяу/гав` → `miau/guau`; the "animal-sound verbs" subtheme → `maullar, ladrar, mugir, ...`.
- **Diminutives** (`-ик/-очка`) → Spanish `-ito/-ita`; keep a few kid-natural ones (`perrito, gatito`).
- **Cognate leverage is higher in Spanish** (English↔Spanish), which is good for a 6-year-old and will shift some D7 scores up — expected, not a bug.

---

## File Structure

- **Modify** [shared/curriculum.ts](shared/curriculum.ts) — add `export const SPANISH_CURRICULUM: CurriculumPhase[]` (the ~500-word ported tree) and a `export const CURRICULA: Record<Language, CurriculumPhase[]>` lookup. Update the leading comment to describe both.
- **Modify** [server/routes.ts](server/routes.ts) — replace the two `language === "russian" ? RUSSIAN_CURRICULUM : []` ternaries ([:313](server/routes.ts#L313), [:2694](server/routes.ts#L2694)) with `CURRICULA[language] ?? []`.
- **Modify** [script/score-frequency-dictionary.ts](script/score-frequency-dictionary.ts) — extract the Russian-specific RUBRIC examples into a per-language `EXAMPLES` block; add a Spanish example set (`mamá`, `plátano`/`banana`, `impuestos`, `caballero`, etc.). The dimension definitions and tier rules stay shared.
- **Create** `script/import-spanish-frequency.ts` — load the chosen Spanish frequency list into `frequency_dictionary` (`language: "spanish"`, with `word`, `english`, `frequencyRank`, `partOfSpeech`, `category`), de-duped and idempotent.
- **Create** `script/build-spanish-vocab.ts` — populate the `vocabulary` table for Spanish: insert every `SPANISH_CURRICULUM` word (so the curriculum page resolves `inVocab=true`), enriching `frequencyRank`/`category`/`partOfSpeech` from the scored dictionary; optionally top up with T1/T2 dict words not already present, to mirror Russian's 738-row depth.
- **Create** `script/generate-spanish-images.ts` — iterate Spanish vocab rows missing `imageUrl`, call the existing `generateOpenAIImage` → `saveImageFromBase64` path (reused from [routes.ts:72-86](server/routes.ts#L72)/[media.ts](server/media.ts)), write the S3 URL back. Concurrency-limited, resumable.
- **(Optional) Modify/retire** [server/spanishVocabulary.ts](server/spanishVocabulary.ts) — the thin 100-word seed is superseded by `build-spanish-vocab.ts`; leave it for the `sync-vocabulary` legacy path or replace its contents with the curriculum-derived list.

No schema/migration changes are required — every table is already language-aware.

---

## Sequencing & dependency graph

```
Task 1 (wiring) ─┐
                 ├─► Task 2 (SPANISH_CURRICULUM) ─► Task 5 (vocab rows) ─► Task 6 (images)
                 │                                       ▲
Task 3 (import freq) ─► Task 4 (score freq) ────────────┘
```

- **Tasks 1 + 2** ship a working Spanish Curriculum page with **no** dependency on the frequency list. Do these first for an early visible win.
- **Tasks 3 + 4** (frequency dictionary) are independent and can run in parallel with Task 2.
- **Task 5** needs Task 2 (word list) and benefits from Task 4 (enrichment).
- **Task 6** needs Task 5.

---

### Task 1: Wire the curriculum lookup to be language-generic

**Files:** Modify [shared/curriculum.ts](shared/curriculum.ts), [server/routes.ts](server/routes.ts)

- [ ] In `shared/curriculum.ts`, add an empty `export const SPANISH_CURRICULUM: CurriculumPhase[] = []` placeholder (filled in Task 2) and `export const CURRICULA: Record<Language, CurriculumPhase[]> = { russian: RUSSIAN_CURRICULUM, spanish: SPANISH_CURRICULUM }`. Import `Language` from `@shared/schema` (or define inline to avoid a server-only import in shared — prefer keying by string).
- [ ] In `routes.ts`, replace both ternaries with `const curriculum = CURRICULA[language] ?? [];` and update the now-stale `// Currently only Russian curriculum is defined.` comment at [:2693](server/routes.ts#L2693).

**Verify:** `npm run build` (or `tsc --noEmit`) passes. `GET /api/users/:spanishUserId/curriculum` returns `{ phases: [], stats: { totalWords: 0, learnedWords: 0 } }` (empty but not erroring) for a Spanish user — confirming the wiring before content lands.

---

### Task 2: Author `SPANISH_CURRICULUM` (port-and-swap, ~500 words)

**Files:** Modify [shared/curriculum.ts](shared/curriculum.ts)

- [ ] Recreate all 10 phases (0–9) with identical `phase`, `name`, `goal`, `color`, and subtheme `name`s as `RUSSIAN_CURRICULUM`.
- [ ] For each subtheme, replace words with Spanish-natural equivalents, applying the **mapping caveats** above (collapse aspect pairs and backfill, adjust pronouns/prepositions/sounds, keep gender in the gloss per Decision 1).
- [ ] Keep the `w(word, english)` helper and bare-lemma convention so the [routes.ts:319](server/routes.ts#L319) `vocabByWord` join (lowercase+trim) resolves.
- [ ] Author in phase order; after each phase, sanity-check it reads as natural kid Spanish, not transliterated Russian.

**Recommended execution:** This is the creative core. Draft phase-by-phase (optionally LLM-assisted for first-pass translation) but **human-review every entry** for register, gender, and the caveats. Target ~500 unique words to match Russian (`totalCurriculumWords` helper already exists for counting).

**Verify:** `totalCurriculumWords(SPANISH_CURRICULUM)` ≈ 480–520. `GET /api/users/:spanishUserId/curriculum` now returns 10 populated phases. Spot-check the Curriculum page ([client/src/pages/Curriculum.tsx](client/src/pages/Curriculum.tsx)) renders for a Spanish user. At this point `inVocab` will be mostly `false` until Task 5.

---

### Task 3: Import a Spanish frequency dictionary (~10k words)

**Files:** Create `script/import-spanish-frequency.ts`

- [ ] Confirm the source list (Decision 2). Parse it into rows of `{ word, english, frequencyRank, partOfSpeech?, category? }`.
- [ ] Insert into `frequency_dictionary` with `language: "spanish"`, de-duping on lowercased `word`. Idempotent (skip existing). Leave scoring columns (`tier`, `d1..d8`, `gatePass`) null — Task 4 fills them.

**Verify:** `SELECT count(*) FROM frequency_dictionary WHERE language='spanish';` ≈ 10k. `SELECT count(*) FROM frequency_dictionary WHERE language='spanish' AND tier IS NULL;` equals that count (all untiered, ready for scoring).

---

### Task 4: Adapt the scoring rubric for Spanish and score

**Files:** Modify [script/score-frequency-dictionary.ts](script/score-frequency-dictionary.ts)

- [ ] Extract the hardcoded Russian examples (мама, банан, налогообложение, вельможа, сущность, автомобиль, проблема) from `RUBRIC` into a per-language `EXAMPLES` constant. Add Spanish equivalents that exercise each tier and gate reason (e.g. `mamá`→T1, `plátano`→T2 cognate, `impuestos`→Reject bureaucratic, `enajenación`→Reject abstract, `coche`/`automóvil`→T3 register note). The D1–D8 definitions, tier rules, and gate categories stay shared.
- [ ] Run `tsx script/score-frequency-dictionary.ts spanish` (existing concurrency/batch flags; uses Haiku + JSON schema, already cache-controlled on the rubric).

**Verify:** Re-run until `getUntieredFrequencyWords("spanish", …)` is empty. `SELECT tier, count(*) FROM frequency_dictionary WHERE language='spanish' GROUP BY tier;` shows a sane distribution roughly matching the rubric targets (T1 ~100, T2 ~400, T3 ~500, T4 ~1000, rest Reject). Spot-check 20 rows for gloss + tier sanity.

---

### Task 5: Populate the Spanish `vocabulary` deck

**Files:** Create `script/build-spanish-vocab.ts` (optionally update [server/spanishVocabulary.ts](server/spanishVocabulary.ts))

- [ ] Collect every unique word from `SPANISH_CURRICULUM`. For each, upsert a `vocabulary` row (`language:"spanish"`, `targetWord`, `english`, `displayOrder` by phase order, and `frequencyRank`/`category`/`partOfSpeech` looked up from the scored `frequency_dictionary` where available; fall back to a high rank if absent).
- [ ] Optionally append T1/T2 dictionary words not already in the deck to reach Russian's ~738-row depth. Idempotent on lowercased `targetWord`.
- [ ] Decide the fate of the legacy 100-word [spanishVocabulary.ts](server/spanishVocabulary.ts): either fold its words in (they're all common) or let this script supersede it. Avoid duplicate rows.

**Verify:** `SELECT count(*) FROM vocabulary WHERE language='spanish';` ≈ curriculum size (+ optional top-up). Re-hit `GET /api/users/:spanishUserId/curriculum` — `inVocab` is now `true` for the curriculum words; `stats.totalWords` matches the tree. Confirm `getWordsToLearn` ([routes.ts:383](server/routes.ts#L383)) returns Spanish words for a Spanish user.

---

### Task 6: Generate images for the Spanish deck

**Files:** Create `script/generate-spanish-images.ts`

- [ ] Query Spanish vocab rows with `imageUrl IS NULL`. For each, reuse the existing prompt-build + `generateOpenAIImage` + `saveImageFromBase64` path (factor out of [routes.ts](server/routes.ts) if needed) and write the returned S3 URL back to `vocabulary.imageUrl`.
- [ ] Run with bounded concurrency; make it resumable (skip rows that already have an image) so a mid-run failure can be retried. **Log** how many were generated vs skipped — no silent caps.

**Verify:** `SELECT count(*) FILTER (WHERE image_url IS NOT NULL), count(*) FROM vocabulary WHERE language='spanish';` approaches full coverage (Russian sits at 422/738; match or exceed that ratio). Spot-check 10 image URLs load and depict the right concept.

**Audio:** No backfill task. TTS is generated and S3-cached on first request via `getOrGenerateTTS` ([tts.ts](server/tts.ts)) with the Rachel voice (RU+ES). Optionally pre-warm by hitting the TTS endpoint per Spanish word, but it is not required for parity.

---

## Definition of done (parity checklist)

- [ ] Spanish Curriculum page renders 10 phases with per-word progress for a Spanish user.
- [ ] `frequency_dictionary` Spanish rows ≈ 10k, fully tiered.
- [ ] `vocabulary` Spanish rows ≈ Russian depth, with frequency/category/POS populated.
- [ ] Image coverage for Spanish vocab ≥ the current Russian ratio.
- [ ] Learn + Review sessions serve Spanish words with working audio (on-demand) and images.
- [ ] No remaining `language === "russian"` special-cases for curriculum in `server/`.
