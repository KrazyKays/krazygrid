"""Générateur pseudo-aléatoire déterministe (mulberry32).

Doit rester strictement identique à `frontend/src/app/core/engine/rng.ts`
pour que le mode local produise les mêmes parties que l'API.
"""

MASK = 0xFFFFFFFF


def next_uint32(state: int) -> tuple[int, int]:
    """Renvoie (valeur uint32, nouvel état)."""
    state = (state + 0x6D2B79F5) & MASK
    t = state
    t = ((t ^ (t >> 15)) * (1 | t)) & MASK
    t = ((t + (((t ^ (t >> 7)) * (61 | t)) & MASK)) & MASK) ^ t
    value = (t ^ (t >> 14)) & MASK
    return value, state
