"""Bake a tileable, directional water slope field using Blender's bundled NumPy.

Run with blender -b -P art/build_ripples.py.
"""
from pathlib import Path

import bpy
import numpy as np

size = 512
random = np.random.default_rng(42)
ky = np.fft.fftfreq(size)[:, None] * size
kx = np.fft.fftfreq(size)[None, :] * size
wave_number = np.maximum(.001, np.hypot(kx, ky))
direction = ((ky + .16 * kx) / wave_number) ** 2
# A band-limited random wave spectrum produces seamless, irregular crests.
power = np.exp(-(2.3 / wave_number) ** 2 - (wave_number / 68) ** 2)
power *= (.11 + direction ** 2) / (wave_number ** 3.9)
spectrum = np.fft.fft2(random.normal(size=(size, size))) * np.sqrt(power)
dx = np.fft.ifft2(spectrum * kx * 1j).real
dy = np.fft.ifft2(spectrum * ky * 1j).real
strength = .156 / dy.std()
pixels = np.ones((size, size, 4), dtype=np.float32)
pixels[:, :, 0] = np.clip(.5 + dx * strength, 0, 1)
pixels[:, :, 1] = np.clip(.5 + dy * strength, 0, 1)
pixels[:, :, 2] = .5
image = bpy.data.images.new('River surface slopes', width=size, height=size, alpha=False)
image.colorspace_settings.name = 'Non-Color'
image.pixels.foreach_set(pixels.ravel())
image.file_format = 'PNG'
image.filepath_raw = str(Path(__file__).resolve().parents[1] / 'public/assets/water-slopes.png')
image.save()
