"""
MOVA local ASR server — Whisper on Apple Silicon (MLX), keyword-spotting oriented.

The game only ever asks: "did she say one of THESE words, right now?"
So this server transcribes a short audio clip with Whisper, then SNAPS the
transcript to the level's target word set (server-side constrained matching).
That recovers most of the robustness that open-vocab Whisper lacks for KWS.

Run:  ./run.sh   (or: uv run uvicorn server:app --host 0.0.0.0 --port 8756)
Env:  WHISPER_MODEL   default mlx-community/whisper-large-v3-turbo
                      (try mlx-community/whisper-small for lower latency)
"""
import io
import os
import re
import time
import tempfile

import numpy as np
import mlx_whisper
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

MODEL = os.environ.get("WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")

app = FastAPI(title="MOVA ASR")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

LANG_MAP = {"russian": "ru", "ru": "ru", "spanish": "es", "es": "es"}


def normalize(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^\w\sЀ-ӿ]", "", s)   # keep letters/digits + Cyrillic
    return re.sub(r"\s+", " ", s).strip()


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def best_match(transcript: str, targets: list[str]):
    """Snap a (possibly noisy) transcript to the closest target word.
    Returns (matched_word|None, score 0..1, how)."""
    t = normalize(transcript)
    if not t or not targets:
        return None, 0.0, "empty"
    toks = t.split(" ")
    norm_targets = [(w, normalize(w)) for w in targets]

    # 1) exact token hit anywhere in the transcript
    for orig, nt in norm_targets:
        if nt in toks:
            return orig, 1.0, "exact"
    # 2) substring (handles "прыгай!" / concatenations)
    for orig, nt in norm_targets:
        if nt and nt in t:
            return orig, 0.95, "substring"
    # 3) fuzzy: best edit-distance ratio between any token and any target
    best = (None, 0.0, "none")
    for tok in toks:
        for orig, nt in norm_targets:
            if not nt:
                continue
            d = levenshtein(tok, nt)
            ratio = 1.0 - d / max(len(tok), len(nt))
            if ratio > best[1]:
                best = (orig, ratio, "fuzzy")
    # only accept fuzzy if reasonably close
    if best[1] >= 0.6:
        return best
    return None, best[1], "no-match"


@app.on_event("startup")
def _warmup():
    print(f"[MOVA ASR] loading model: {MODEL}")
    silent = np.zeros(16000, dtype=np.float32)  # 1s of silence to force model download/compile
    t0 = time.time()
    mlx_whisper.transcribe(silent, path_or_hf_repo=MODEL)
    print(f"[MOVA ASR] model ready in {time.time()-t0:.1f}s")


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL}


@app.post("/asr")
async def asr(
    file: UploadFile = File(...),
    targets: str = Form(""),
    lang: str = Form("russian"),
):
    raw = await file.read()
    target_list = [w.strip() for w in re.split(r"[,\s]+", targets) if w.strip()]
    language = LANG_MAP.get(lang.lower(), "ru")

    # persist to a temp file so mlx_whisper/ffmpeg can decode any container (webm/wav/m4a)
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        opts = dict(path_or_hf_repo=MODEL, language=language,
                    condition_on_previous_text=False, temperature=0.0)
        # soft-bias the decoder toward the words we care about
        if target_list:
            opts["initial_prompt"] = " ".join(target_list)
        t0 = time.time()
        result = mlx_whisper.transcribe(tmp_path, **opts)
        decode_ms = round((time.time() - t0) * 1000)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    transcript = (result.get("text") or "").strip()
    matched, score, how = best_match(transcript, target_list)
    return JSONResponse({
        "transcript": transcript,
        "matched": matched,
        "score": round(float(score), 3),
        "how": how,
        "decode_ms": decode_ms,
        "bytes": len(raw),
        "model": MODEL,
    })
