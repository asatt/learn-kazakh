"""Generates MP3 pronunciations of the Kazakh words with Piper, an offline text-to-speech engine.

Reads site/data/words.json (run `node scripts/build.mjs` first), writes each missing file named in a word's
"audio" field to site/, and deletes MP3 files in site/audio/ that no word references anymore. The voice, speaker,
and speed come from tts.json. The voice model is downloaded once into .cache/voices/ and checked against the
SHA-256 checksums in tts.json on every run, so a tampered or corrupted model stops the build.

Requires the packages in scripts/requirements.txt.
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import lameenc
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT / "site"
AUDIO_DIR = SITE_DIR / "audio"
WORDS_FILE = SITE_DIR / "data" / "words.json"
MODELS_DIR = ROOT / ".cache" / "voices"
VOICES_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
MP3_BITRATE_KBPS = 48


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def load_voice(name: str, checksums: dict[str, str]) -> PiperVoice:
    """Loads a Piper voice such as "kk_KZ-issai-high", downloading it on first use and verifying its checksums."""
    locale, speaker, quality = name.split("-")
    model = MODELS_DIR / f"{name}.onnx"
    actual = {}
    for path in (model, model.with_suffix(".onnx.json")):
        if not path.exists():
            url = f"{VOICES_URL}/{locale.split('_')[0]}/{locale}/{speaker}/{quality}/{path.name}"
            print(f"Downloading {url}")
            path.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(url, path.with_suffix(".part"))
            path.with_suffix(".part").rename(path)
        actual[path.name] = sha256(path)

    if not all(checksums.get(file) for file in actual):
        found = "\n".join(f'    "{file}": "{digest}"' for file, digest in actual.items())
        sys.exit(
            f"tts.json has no SHA-256 checksums for {name}. The downloaded files hash to:\n{found}\n"
            "Compare them with the checksums on Hugging Face, then add them to the \"sha256\" object in tts.json."
        )
    for file, digest in actual.items():
        if digest != checksums[file]:
            sys.exit(
                f"Checksum mismatch for .cache/voices/{file}: expected {checksums[file]}, got {digest}. "
                "Delete the file to download it again. If the mismatch persists, the upstream file has changed."
            )
    return PiperVoice.load(model)


def synthesize_mp3(voice: PiperVoice, text: str, config: SynthesisConfig) -> bytes:
    chunks = list(voice.synthesize(text, config))
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(MP3_BITRATE_KBPS)
    encoder.set_in_sample_rate(chunks[0].sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    pcm = b"".join(chunk.audio_int16_bytes for chunk in chunks)
    return encoder.encode(pcm) + encoder.flush()


def main() -> None:
    if not WORDS_FILE.exists():
        sys.exit(f"Cannot find {WORDS_FILE.relative_to(ROOT)}. Run `node scripts/build.mjs` first.")

    settings = json.loads((ROOT / "tts.json").read_text(encoding="utf-8"))
    words = json.loads(WORDS_FILE.read_text(encoding="utf-8"))["words"]
    wanted = {w["audio"]: w["kk"] for w in words if w.get("audio")}
    missing = {path: text for path, text in wanted.items() if not (SITE_DIR / path).exists()}

    if missing:
        voice = load_voice(settings["voice"], settings.get("sha256", {}))
        # Single-speaker voices reject a speaker ID.
        speaker = settings.get("speaker") if voice.config.num_speakers > 1 else None
        config = SynthesisConfig(speaker_id=speaker, length_scale=settings.get("lengthScale"))
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        for i, (path, text) in enumerate(sorted(missing.items(), key=lambda item: item[1]), start=1):
            (SITE_DIR / path).write_bytes(synthesize_mp3(voice, text, config))
            print(f"[{i}/{len(missing)}] {text}")

    stale = [f for f in AUDIO_DIR.glob("*.mp3") if f"audio/{f.name}" not in wanted] if AUDIO_DIR.exists() else []
    for file in stale:
        file.unlink()

    print(f"Audio: {len(missing)} generated, {len(wanted) - len(missing)} up to date, {len(stale)} removed.")


if __name__ == "__main__":
    main()
