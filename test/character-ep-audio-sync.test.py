import importlib.util
from pathlib import Path
import unittest
import subprocess
import tempfile
import wave
import json
import sys
from unittest.mock import patch

import numpy as np

spec = importlib.util.spec_from_file_location("audio_sync", Path(__file__).resolve().parents[1] / "scripts/character-ep-audio-sync.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def sample_song(seed=42, duration=80):
    rng = np.random.default_rng(seed)
    count = duration * sync.SAMPLE_RATE
    time = np.arange(count) / sync.SAMPLE_RATE
    song = np.zeros(count)
    # Independent changing timbres/rhythms avoid an unrealistically easy
    # impulse fixture and exercise the same spectral matcher as real music.
    for frequency in (130, 290, 570, 1100, 2300):
        envelope = np.interp(time, np.arange(0, duration + 0.2, 0.2), rng.uniform(0, 1, duration * 5 + 1))
        song += envelope * np.sin(2 * np.pi * frequency * time)
    return (song + rng.normal(0, 0.04, count)).astype(np.float32) / 6


class AudioSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.song = sample_song()

    def test_extra_mv_intro_and_outro(self):
        intro = np.zeros(round(2.36 * sync.SAMPLE_RATE))
        video = np.concatenate([intro, self.song * 0.4, np.zeros(7 * sync.SAMPLE_RATE)])
        result = sync.estimate_offset(self.song, video)
        self.assertEqual(result["status"], "accepted", result)
        self.assertAlmostEqual(result["offsetSeconds"], 2.36, delta=0.04)

    def test_mv_ahead_and_equal_total_durations(self):
        trim = round(3.14 * sync.SAMPLE_RATE)
        video = np.concatenate([self.song[trim:], np.zeros(trim)])
        result = sync.estimate_offset(self.song, video)
        self.assertEqual(result["status"], "accepted", result)
        self.assertAlmostEqual(result["offsetSeconds"], -3.14, delta=0.04)

    def test_subframe_shift_noise_and_gain(self):
        shift = round(1.373 * sync.SAMPLE_RATE)
        rng = np.random.default_rng(99)
        video = np.concatenate([np.zeros(shift), self.song * 0.5])
        video += rng.normal(0, 0.003, len(video))
        result = sync.estimate_offset(self.song, video)
        self.assertEqual(result["status"], "accepted", result)
        self.assertAlmostEqual(result["offsetSeconds"], 1.373, delta=0.04)

    def test_identical_tracks(self):
        result = sync.estimate_offset(self.song, self.song)
        self.assertEqual(result["status"], "accepted", result)
        self.assertEqual(result["offsetSeconds"], 0)

    def test_unrelated_song_is_rejected(self):
        self.assertEqual(sync.estimate_offset(self.song, sample_song(seed=999))["status"], "rejected")

    def test_silence_is_rejected(self):
        self.assertEqual(sync.estimate_offset(np.zeros_like(self.song), np.zeros_like(self.song))["status"], "rejected")

    def test_speed_drift_is_rejected(self):
        indices = np.arange(0, len(self.song), 1.005)
        video = np.interp(indices, np.arange(len(self.song)), self.song)
        self.assertEqual(sync.estimate_offset(self.song, video)["status"], "rejected")

    def test_mid_song_edit_is_rejected(self):
        midpoint = len(self.song) // 2
        video = np.concatenate([self.song[:midpoint], self.song[midpoint + sync.SAMPLE_RATE:]])
        self.assertEqual(sync.estimate_offset(self.song, video)["status"], "rejected")

    def test_short_tracks_are_rejected(self):
        result = sync.estimate_offset(self.song[:sync.SAMPLE_RATE * 20], self.song)
        self.assertEqual(result["reason"], "audio_too_short")

    def test_repeated_motif_is_ambiguous(self):
        motif = self.song[:10 * sync.SAMPLE_RATE]
        repeated = np.tile(motif, 8)
        self.assertEqual(sync.estimate_offset(repeated, repeated)["status"], "rejected")

    def test_lossy_aac_decode_pipeline(self):
        try:
            ffmpeg = sync.ffmpeg_executable()
        except RuntimeError:
            self.skipTest("ffmpeg is not installed")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            video = np.concatenate([np.zeros(round(2.36 * sync.SAMPLE_RATE)), self.song])
            for name, samples in (("song", self.song), ("video", video)):
                with wave.open(str(root / f"{name}.wav"), "wb") as output:
                    output.setnchannels(1)
                    output.setsampwidth(2)
                    output.setframerate(sync.SAMPLE_RATE)
                    output.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
            subprocess.run([ffmpeg, "-v", "error", "-i", str(root / "video.wav"),
                            "-c:a", "aac", "-b:a", "64k", str(root / "video.m4a")],
                           check=True, capture_output=True, timeout=30)
            completed = subprocess.run([
                sys.executable, "-B", str(Path(sync.__file__)),
                "--audio-file", str(root / "song.wav"), "--video-file", str(root / "video.m4a"),
                "--work-dir", str(root),
            ], check=True, capture_output=True, text=True, timeout=45)
            result = json.loads(completed.stdout)
            self.assertEqual(result["status"], "accepted", result)
            self.assertAlmostEqual(result["offsetSeconds"], 2.36, delta=0.06)
            self.assertFalse(any(root.glob("character-ep-audio-*")))

    def test_direct_audio_uses_backup_when_primary_download_fails(self):
        calls = []
        with tempfile.TemporaryDirectory() as temporary:
            def download(url, destination, **options):
                calls.append((url, options))
                if url == "https://cdn.test/primary":
                    raise subprocess.CalledProcessError(22, "curl")
                Path(destination).write_bytes(b"test audio")

            with patch.object(sync, "download_file", side_effect=download):
                audio, video, acquisition = sync.download_sources("https://song.test/audio", "https://video.test/page",
                    Path(temporary), ["https://cdn.test/primary", "https://cdn.test/backup"])
            self.assertEqual(acquisition, "playurl")
            self.assertTrue(audio.is_file())
            self.assertTrue(video.is_file())
            self.assertEqual(len(calls), 3)
            self.assertEqual(calls[-1][1]["referer"], "https://www.bilibili.com/")


if __name__ == "__main__":
    unittest.main()
