"""Easing helpers. All take t in [0, 1] and return a float (may overshoot)."""
import math


def clamp01(t):
    return 0.0 if t < 0 else 1.0 if t > 1 else t


def linear(t):
    return clamp01(t)


def ease_out_cubic(t):
    t = clamp01(t)
    return 1 - (1 - t) ** 3


def ease_in_cubic(t):
    t = clamp01(t)
    return t ** 3


def ease_in_out_sine(t):
    t = clamp01(t)
    return -(math.cos(math.pi * t) - 1) / 2


def ease_in_out_cubic(t):
    t = clamp01(t)
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_expo(t):
    t = clamp01(t)
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)


def ease_out_back(t, s=1.70158):
    t = clamp01(t)
    return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2


def lerp(a, b, t):
    return a + (b - a) * t
