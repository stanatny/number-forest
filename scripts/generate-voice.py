#!/usr/bin/env python3
"""Generate complete Chinese utterances locally; resume after each saved MP3.

Requires Python 3.12+, Node.js, ffmpeg, mlx-audio and soundfile in a project-local
virtual environment. Model weights must already exist at --model. No service
calls, credentials, voice cloning or model downloads are performed here.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
INSTRUCT = '用温暖、自然的普通话，像亲切的幼儿老师一样说话。语速稍慢，停顿清楚，语气有好奇心，不要夸张地拖长音。'
MODEL_ID = 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit'
MODEL_REVISION = '41d3337e8b7f2843a75841595fc14e4b9a7a4b96'


def normalize_text(text):
    return re.sub(r'[？?]', '。', re.sub(r'[！!]', '。', re.sub(r'\s+', '', text)))


def chinese_number(value):
    digits = '零一二三四五六七八九'
    if value < 10:
        return digits[value]
    if value < 100:
        return (digits[value // 10] if value >= 20 else '') + '十' + (digits[value % 10] if value % 10 else '')
    raise ValueError('Add an explicit pronunciation rule for numbers >= 100')


def spoken_text(text):
    text = re.sub(r'\s+', '', text)
    text = re.sub(r'(\d{1,2}):(00|30)', lambda match: chinese_number(int(match[1])) + ('点整' if match[2] == '00' else '点半'), text)
    if re.search(r'\d+:\d+', text):
        raise ValueError('Add an explicit pronunciation rule for non-whole/half-hour time: ' + text)
    text = re.sub(r'(?<![\d第])2(?=[颗个篮袋])', '两', text)
    text = re.sub(r'\d+', lambda match: chinese_number(int(match[0])), text)
    return text.replace('×', '乘').replace('÷', '除以')


def atomic_write(path, text):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    os.replace(temporary, path)


def read_corpus():
    data = json.loads(subprocess.check_output(['node', str(PROJECT / 'scripts' / 'voice-corpus.cjs')], text=True))
    rows, seen = [], set()
    sources = [('common', data['common']), ('hint', data['guidance']), ('prompt', sorted(data['prompts'], key=lambda text: (len(spoken_text(text)), text)))]
    for kind, texts in sources:
        for text in texts:
            key = normalize_text(text)
            if key in seen:
                continue
            seen.add(key)
            rows.append({'key': key, 'text': text, 'spoken': spoken_text(text), 'kind': kind, 'filename': 'serena-' + hashlib.sha256(key.encode()).hexdigest()[:20] + '.mp3'})
    return rows


def load_progress(rows, scratch, output, regenerate=False):
    if regenerate:
        return {}
    state_path = scratch / 'voice-progress.json'
    previous = json.loads(state_path.read_text()) if state_path.exists() else {}
    progress = {}
    published = []
    for row in rows:
        saved = previous.get(row['key'])
        if saved and saved.get('spoken') == row['spoken'] and (output / saved['filename']).is_file():
            progress[row['key']] = saved
        elif not saved and (output / row['filename']).is_file():
            published.append(row)
    # A fresh checkout has the committed clips but no ignored generation state.
    # Validate and reuse those files rather than regenerating the whole library.
    if published and not shutil.which('ffprobe'):
        raise SystemExit('ffprobe (included with ffmpeg) is required to reuse existing MP3 files.')

    def inspect(row):
        result = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', str(output / row['filename'])], capture_output=True, text=True)
        try:
            data = json.loads(result.stdout)
            stream = data['streams'][0]
            duration = float(data['format']['duration'])
            if result.returncode or stream['codec_name'] != 'mp3' or int(stream['sample_rate']) != 24000 or stream['channels'] != 1 or duration < 0.4:
                return None
        except (ValueError, KeyError, IndexError):
            return None
        return {**row, 'audioSeconds': duration, 'tokens': None, 'reusedPublishedClip': True}

    with ThreadPoolExecutor(max_workers=4) as pool:
        for saved in pool.map(inspect, published):
            if saved:
                progress[saved['key']] = saved
    return progress


def coverage(progress, rows, output):
    expected = {kind: sum(row['kind'] == kind for row in rows) for kind in ['common', 'hint', 'prompt']}
    complete = {kind: sum(row['kind'] == kind and row['key'] in progress for row in rows) for kind in expected}
    return {'voice': 'Serena', 'model': MODEL_ID, 'modelRevision': MODEL_REVISION, 'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'expected': expected, 'complete': complete, 'clips': len(progress), 'audioSeconds': sum(row['audioSeconds'] for row in progress.values()), 'bytes': sum((output / row['filename']).stat().st_size for row in progress.values()), 'missing': [row['text'] for row in rows if row['key'] not in progress]}


def save(progress, rows, scratch, output, url_prefix):
    atomic_write(scratch / 'voice-progress.json', json.dumps(progress, ensure_ascii=False, indent=2))
    manifest = {key: url_prefix.rstrip('/') + '/' + row['filename'] for key, row in progress.items()}
    atomic_write(output / 'manifest.js', '/* Generated offline with Qwen3-TTS / Serena. See README.md. */\nwindow.NumberForestVoiceClips = ' + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n')
    report = coverage(progress, rows, output)
    atomic_write(scratch / 'voice-coverage.json', json.dumps(report, ensure_ascii=False, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scratch', type=Path, default=PROJECT / '.local' / 'tts-research')
    parser.add_argument('--model', type=Path, help='Local Qwen3-TTS CustomVoice model directory; defaults to scratch/models/qwen3-1.7b-custom-8bit')
    parser.add_argument('--output', type=Path, default=PROJECT / 'assets' / 'voice')
    parser.add_argument('--url-prefix', default='assets/voice')
    parser.add_argument('--batch-size', type=int, default=8)
    parser.add_argument('--limit', type=int, help='Generate at most this many missing clips')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--temperature', type=float, default=0.7)
    parser.add_argument('--max-tokens', type=int, default=384)
    parser.add_argument('--regenerate', action='store_true', help='Replace existing recordings; use after changing voice, model or pronunciation rules')
    parser.add_argument('--dry-run', action='store_true', help='Print coverage without loading MLX, writing files or generating audio')
    args = parser.parse_args()
    if args.batch_size < 1 or (args.limit is not None and args.limit < 1):
        parser.error('batch-size and limit must be positive')
    scratch, output = args.scratch.resolve(), args.output.resolve()
    rows = read_corpus()
    if args.dry_run:
        progress = load_progress(rows, scratch, output, args.regenerate)
        print(json.dumps(coverage(progress, rows, output), ensure_ascii=False, indent=2))
        return
    scratch.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    # One writer per output directory. Locks are automatically released on exit.
    import fcntl
    lock_directory = PROJECT / '.local' / 'voice-locks'
    lock_directory.mkdir(parents=True, exist_ok=True)
    lock_path = lock_directory / (hashlib.sha256(str(output).encode()).hexdigest()[:20] + '.lock')
    lock = lock_path.open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('Another voice generator is writing to this output directory.')
    try:
        progress = load_progress(rows, scratch, output, args.regenerate)
        pending = [row for row in rows if row['key'] not in progress]
        if args.limit:
            pending = pending[:args.limit]
        if not pending:
            save(progress, rows, scratch, output, args.url_prefix)
            print('Already complete')
            return
        model_path = (args.model or scratch / 'models' / 'qwen3-1.7b-custom-8bit').resolve()
        if not model_path.is_dir():
            raise SystemExit('Download model weights first and pass their directory with --model.')
        if not shutil.which('ffmpeg'):
            raise SystemExit('ffmpeg is required to encode browser-compatible MP3 files.')
        os.environ.setdefault('HF_HOME', str(scratch / 'hf-cache'))
        os.environ.setdefault('XDG_CACHE_HOME', str(scratch / 'cache'))
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        import mlx.core as mx
        import numpy as np
        import soundfile as sf
        from mlx_audio.tts.utils import load_model
        model = load_model(str(model_path))
        # Only replace the index after prerequisites and model loading succeed.
        save(progress, rows, scratch, output, args.url_prefix)
        atomic_write(scratch / 'voice-corpus.json', json.dumps(rows, ensure_ascii=False, indent=2))
        for offset in range(0, len(pending), args.batch_size):
            batch = pending[offset:offset + args.batch_size]
            batch_started = time.monotonic()
            mx.random.seed(args.seed + offset)
            results = list(model.batch_generate(texts=[row['spoken'] for row in batch], voices=['Serena'] * len(batch), instructs=[INSTRUCT] * len(batch), lang_code='Chinese', temperature=args.temperature, max_tokens=args.max_tokens, stream=False))
            if len(results) != len(batch):
                raise RuntimeError('Batch did not produce one result per text; rerun to resume saved clips.')
            for result in results:
                row = batch[result.sequence_idx]
                samples = np.asarray(result.audio)
                duration = len(samples) / result.sample_rate
                if not np.all(np.isfinite(samples)) or duration < 0.4 or result.token_count >= args.max_tokens - 1:
                    raise RuntimeError('Invalid or truncated audio; inspect and rerun: ' + row['text'])
                temporary_wav = scratch / 'current-clip.wav'
                sf.write(temporary_wav, samples, result.sample_rate, subtype='PCM_16')
                staging = output / (row['filename'] + '.tmp.mp3')
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(temporary_wav), '-af', 'loudnorm=I=-18:TP=-2:LRA=7', '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', str(staging)], check=True)
                os.replace(staging, output / row['filename'])
                progress[row['key']] = {**row, 'audioSeconds': duration, 'tokens': result.token_count, 'peakMemoryGB': mx.get_peak_memory() / 1e9}
                report = save(progress, rows, scratch, output, args.url_prefix)
            elapsed = time.monotonic() - batch_started
            log = {'batchOffset': offset, 'batchSize': len(batch), 'seconds': elapsed, 'clipsPerSecond': len(batch) / elapsed, 'completed': report['complete'], 'audioSeconds': sum(result.samples / result.sample_rate for result in results), 'peakMemoryGB': mx.get_peak_memory() / 1e9}
            with (scratch / 'voice-batches.jsonl').open('a') as file:
                file.write(json.dumps(log) + '\n')
            print(json.dumps(log), flush=True)
        print('FINISHED', json.dumps(save(progress, rows, scratch, output, args.url_prefix)['complete']), flush=True)
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()
        # Keep the lock inode: unlinking after unlock can race with a new writer.


if __name__ == '__main__':
    main()
