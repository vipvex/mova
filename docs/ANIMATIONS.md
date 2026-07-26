# MOVA — Animation Inventory

Animation in MOVA is **two layers**:

1. **Procedural "juice" tweens** — bob, squash, wobble, sparkle (`client/src/game/anims.ts`).
2. **AI video clips** — one MP4/WebM per named state × isometric facing. Catalog: `VIDEO_ANIM_SPECS` in [`shared/animCatalog.ts`](../shared/animCatalog.ts). Studio: **Animations** tab.

Legacy PNG flipbooks remain as fallback when a video isn’t generated yet.

---

## Video clips

Keys: `{baseKey}__vid_{clip}` or `{baseKey}__vid_{clip}_{dir}`  
Examples: `char_athena__vid_idle_se`, `char_athena__vid_walk_n`

### Isometric directions (8-way)

`n · ne · e · se · s · sw · w · nw` (screen space: N = up, E = right)

| Clip | Directions | Kind |
|---|---|---|
| Athena idle / walk / run / carry | 8 | loop |
| Athena listen / speak / celebrate / confused | — | oneshot |
| Grandma idle | 4 (cardinals) | loop |
| Grandma listen / celebrate / confused | — | oneshot |

Kitchen picks facing from movement velocity and plays the matching directional video.

---

## Pipeline

1. Base still from Assets (`char_athena`)
2. **Facing still** per direction (`char_athena__face_n` … `__face_nw`) — image-edit of the base so the character already faces that way (same isometric camera). Shared by idle/walk/run/carry for that dir.
3. Motion prompt + facing clause + chroma-green plate (`#00FF00`)
4. xAI image-to-video **from the facing still** → MP4 (falls back to base only if facing is skipped)
5. **ffmpeg chromakey** → transparent WebM
6. **Extract sprites** → dense PNG flipbook (auto after gen)
7. Optional **loop trim** — extraction honors start/end

### Flipbook density (not 1:1 with video length)

Videos are ~3–4s; we do **not** extract 4×24fps frames. Catalog defaults:

| Clip | Frames | Playback |
|---|---|---|
| walk / run | 16 | 12 / 14 fps |
| idle / carry | 12 | 8 fps |
| oneshots | 12 | 12 fps (play once, hold last) |

Re-extract after changing defaults so old 6–8 frame packs are replaced.

**Why facing stills:** seeding video from the SE base and asking the model to “turn north” wastes the clip on a reorient. Start already facing the target direction.

**Runtime (Kitchen):** prefers extracted PNG flipbooks → video fallback → legacy sheets.

---

## Studio (Animations tab)

- Admin table of every clip × direction
- Filters: character, clip name, status
- Inspector: **facing still**, dual preview (**Video** | **Sprites** flipbook), motion prompt, **loop trim**, **Remove green**, versions
- Re-extract sprites switches preview to the flipbook so you can verify gameplay frames
- **Generate missing / Regen selected** run the full pipeline sequentially:
  1. unique facing stills (shared per direction)
  2. video + chroma
  3. extract sprite frames (retries client-side if needed)
- Single Generate also uses `ensureFacing` + auto-extract on the server

---

## Kitchen wiring

- Prefers extracted PNG flipbooks → video → legacy sheets (Athena + Grandma)
- **Athena:** `idle` · `walk` · `run` (Shift) · `carry` (standing) · oneshots `listen` / `speak` / `celebrate` / `confused`
- **Grandma:** directional `idle` (4-way, faces Athena) · oneshots `listen` (new order) · `celebrate` / `confused` (deliver)
- Facing baked into directional plates — no `flipX`
