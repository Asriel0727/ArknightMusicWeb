"""Estimate video_time = audio_time + offset from three spectral matches.

Only numpy is needed for analysis. Downloads prefer playurl audio/curl with
yt-dlp as fallback, and decoding uses
ffmpeg, all in a temporary directory that is removed after each attempt.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np

SAMPLE_RATE = 8000
HOP = 160
FRAME_SECONDS = HOP / SAMPLE_RATE
VERSION = 1


def spectral_features(samples):
    samples = np.asarray(samples, dtype=np.float32)
    if len(samples) < 512 or not np.all(np.isfinite(samples)):
        raise ValueError("invalid_audio")
    frames = np.lib.stride_tricks.sliding_window_view(samples, 512)[::HOP]
    power = np.abs(np.fft.rfft(frames * np.hanning(512), axis=1)) ** 2
    frequencies = np.fft.rfftfreq(512, 1 / SAMPLE_RATE)
    edges = np.geomspace(80, 3800, 13)
    bands = np.stack([
        power[:, (frequencies >= low) & (frequencies < high)].mean(axis=1)
        for low, high in zip(edges[:-1], edges[1:])
    ], axis=1)
    # Relative energy removes gain differences. Temporal changes discriminate
    # musical events while tolerating lossy encoding and small mastering changes.
    scale = max(float(np.max(bands)) * 1e-6, 1e-12)
    changes = np.diff(np.log(bands + scale), axis=0)
    changes /= np.maximum(changes.std(axis=0), 0.01)
    return np.clip(changes, -5, 5)


def match_window(audio, video, start, length, max_offset):
    template = audio[start:start + length]
    low = max(0, start - max_offset)
    high = min(len(video), start + length + max_offset)
    search = video[low:high]
    if len(search) < length:
        return None
    # FFT convolution is the numerator of normalized cross-correlation.
    size = 1 << (len(search) + length - 2).bit_length()
    convolution = np.fft.irfft(
        np.fft.rfft(search, n=size, axis=0)
        * np.fft.rfft(template[::-1], n=size, axis=0), n=size, axis=0,
    ).sum(axis=1)[length - 1:len(search)]
    energy = np.concatenate(([0.0], np.cumsum((search ** 2).sum(axis=1))))
    norm = np.sqrt(np.maximum((energy[length:] - energy[:-length]) * np.sum(template ** 2), 0))
    scores = np.divide(convolution, norm, out=np.zeros_like(convolution), where=norm > 1e-8)
    peak = int(np.argmax(scores))
    # A repeated chorus or beat should not win merely because it is loud.
    other = scores.copy()
    radius = round(0.5 / FRAME_SECONDS)
    other[max(0, peak - radius):peak + radius + 1] = -1
    return {
        "audioTime": round(start * FRAME_SECONDS, 3),
        "offsetSeconds": round((low + peak - start) * FRAME_SECONDS, 3),
        "similarity": round(float(np.clip(scores[peak], -1, 1)), 4),
        "peakMargin": round(float(scores[peak] - other.max()), 4),
    }


def estimate_offset(audio_samples, video_samples):
    audio = spectral_features(audio_samples)
    video = spectral_features(video_samples)
    if min(len(audio), len(video)) * FRAME_SECONDS < 40:
        return {"status": "rejected", "reason": "audio_too_short", "algorithmVersion": VERSION}
    length = round(15 / FRAME_SECONDS)
    windows = [match_window(audio, video, round((len(audio) - length) * position),
                            length, round(60 / FRAME_SECONDS))
               for position in (0.15, 0.5, 0.85)]
    valid = [window for window in windows if window is not None]
    result = {"status": "rejected", "algorithmVersion": VERSION, "windows": valid}
    if len(valid) != 3 or any(w["similarity"] < 0.65 or w["peakMargin"] < 0.08 for w in valid):
        return {**result, "reason": "low_or_ambiguous_similarity"}
    offsets = [w["offsetSeconds"] for w in valid]
    if max(offsets) - min(offsets) > 0.16:
        return {**result, "reason": "inconsistent_offsets_or_speed_drift"}
    return {**result, "status": "accepted", "offsetSeconds": round(float(np.median(offsets)), 3),
            "confidence": min(w["similarity"] for w in valid)}


def ffmpeg_executable():
    executable = os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as error:
        raise RuntimeError("ffmpeg_not_installed") from error


def decode_audio(path):
    result = subprocess.run([
        ffmpeg_executable(), "-v", "error", "-nostdin", "-i", str(path),
        "-t", "600", "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1",
    ], capture_output=True, timeout=45, check=True)
    return np.frombuffer(result.stdout, dtype="<f4")


class QuietLogger:
    def debug(self, _message):
        pass

    info = warning = error = debug


def download_file(url, destination, timeout=45, referer=None):
    headers = ["--referer", referer] if referer else []
    subprocess.run([
        "curl", "--fail", "--silent", "--show-error", "--location",
        "--connect-timeout", "10", "--max-time", str(timeout), "--max-filesize", "104857600",
        "--user-agent", "Mozilla/5.0", *headers, "--output", str(destination), "--", url,
    ], check=True, capture_output=True, timeout=timeout + 5)


def download_sources(audio_url, video_url, directory, video_audio_urls=()):
    audio_path = directory / "song.audio"
    download_file(audio_url, audio_path)
    video_path = directory / "mv.audio"
    for source in video_audio_urls[:2]:
        try:
            download_file(source, video_path, timeout=20, referer="https://www.bilibili.com/")
            return audio_path, video_path, "playurl"
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            # Expired or unavailable CDN URLs must not prevent extractor fallback.
            video_path.unlink(missing_ok=True)
    from yt_dlp import YoutubeDL
    with YoutubeDL({
        "format": "bestaudio/best", "noplaylist": True, "playlist_items": "1",
        "outtmpl": str(directory / "mv.%(ext)s"), "quiet": True, "no_warnings": True,
        "logger": QuietLogger(), "socket_timeout": 15, "retries": 1, "fragment_retries": 1,
        "max_filesize": 104857600,
    }) as downloader:
        info = downloader.extract_info(video_url, download=True)
        if info.get("entries") is not None:
            info = next(entry for entry in info["entries"] if entry)
        downloads = info.get("requested_downloads") or []
        video_path = Path(downloads[0]["filepath"] if downloads else downloader.prepare_filename(info))
    if not video_path.is_file():
        raise RuntimeError("video_audio_unavailable")
    return audio_path, video_path, "yt-dlp"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-url")
    parser.add_argument("--video-url")
    parser.add_argument("--audio-file")
    parser.add_argument("--video-file")
    parser.add_argument("--work-dir")
    parser.add_argument("--video-audio-urls-file")
    options = parser.parse_args()
    phase = "download"
    try:
        with tempfile.TemporaryDirectory(prefix="character-ep-audio-", dir=options.work_dir) as temporary:
            if options.audio_file and options.video_file:
                paths = (options.audio_file, options.video_file)
                acquisition = "local-files"
            elif options.audio_url and options.video_url:
                urls = json.loads(Path(options.video_audio_urls_file).read_text(encoding="utf-8")) if options.video_audio_urls_file else []
                if not isinstance(urls, list) or any(not isinstance(url, str) for url in urls):
                    raise ValueError("invalid_audio_source_list")
                audio_path, video_path, acquisition = download_sources(options.audio_url, options.video_url, Path(temporary), urls)
                paths = (audio_path, video_path)
            else:
                raise ValueError("provide_both_audio_and_video")
            phase = "decode_or_match"
            result = estimate_offset(*(decode_audio(path) for path in paths))
            result["acquisition"] = acquisition
        print(json.dumps(result, allow_nan=False))
    except Exception as error:
        # Do not echo signed audio URLs or downloader headers into CI logs.
        print(json.dumps({"status": "failed", "reason": f"{phase}:{type(error).__name__}", "algorithmVersion": VERSION}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
