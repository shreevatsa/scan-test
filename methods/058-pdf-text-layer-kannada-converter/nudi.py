"""Kannada text in the Nudi/Baraha-style legacy font encoding, as Unicode. Written for this repository (no outside code).

In the legacy encoding, each byte (read as Windows-1252) is a glyph piece, in the order the pieces are drawn:
- a consonant's body (P for ಕ), or a consonant with its i sign as one glyph (Q for ಕಿ), or a whole letter (R for ಖ);
- then its vowel sign as pieces: À the head stroke (the inherent a), Á ಾ, É ೆ, Ã the length mark (ೀ ೇ ೋ), Ä or Å ು,
  Æ or Ç ೂ (and, after É, the second part of ೊ), È ೃ, Ê (after É) ೈ, Ë ೌ, ï the virama;
- subjoined consonants (ottu: ß for ್ನ, æ for ್ರ, …), which may come before the length mark;
- ð, the repha (arkavattu): ರ್, drawn after the syllable, written first in Unicode;
- s (or ü after an i form), a stroke that makes ಡ ದ ಬ ಪ into ಢ ಧ ಭ ಫ.
ಮ is drawn as ವ's body with a hook (ªÀÄ ಮ, ªÀiÁ ಮಾ, ªÉÄ ಮೆ, ªÉÆ ಮೊ, «Ä ಮಿ), and ಯ as Ai with the same hook
(AiÀÄ ಯ, AiÀiÁ ಯಾ, ¬Ä ಯಿ). A syllable is collected (its consonant, then every sign piece, subjoined consonant
and repha up to the next consonant, vowel or space) and written in Unicode order: repha, consonant, subjoined
consonants each after a virama, vowel sign, then anusvara or visarga.

The tables were read off the PDF's own glyphs (each code drawn with its embedded font) and checked against an
independent reading of rendered pages (methods 057 and 058's compare.py). convert() also returns the pieces it
could not place, so that gaps show.
"""
import re
import unicodedata

VIRAMA = "್"
# Consonant bodies, which take a vowel sign (or À for the inherent a).
BODY = {"P": "ಕ", "S": "ಖ", "U": "ಗ", "W": "ಘ", "Y": "ಙ", "Z": "ಚ", "k": "ಞ", "b": "ಛ", "d": "ಜ", "e": "ಜ", "g": "ರ", "l": "ಟ", "m": "ಟ",
        "o": "ಠ", "q": "ಡ", "t": "ಣ", "u": "ಣ", "v": "ತ", "x": "ಥ", "z": "ದ", "£": "ನ", "¥": "ಪ", "¨": "ಬ", "ª": "ವ", "®": "ಲ", "¯": "ಲ",
        "±": "ಶ", "µ": "ಷ", "¸": "ಸ", "º": "ಹ", "¼": "ಳ"}
# Consonants with their i sign as one glyph (with Ã: ೀ).
WITH_I = {"Q": "ಕ", "T": "ಖ", "V": "ಗ", "a": "ಚ", "c": "ಛ", "f": "ಜ", "j": "ರ", "n": "ಟ", "p": "ಠ", "r": "ಡ",
          "w": "ತ", "y": "ಥ", "¢": "ದ", "¤": "ನ", "¦": "ಪ", "©": "ಬ", "«": "ವ", "¬": "ಯ", "°": "ಲ", "²": "ಶ", "¶": "ಷ",
          "¹": "ಸ", "»": "ಹ", "½": "ಳ"}
# Whole letters with the inherent a.
WHOLE = {"R": "ಖ", "§": "ಬ"}
VOWELS = {"IÄ": "ಋ", "IÆ": "ೠ", "C": "ಅ", "D": "ಆ", "E": "ಇ", "F": "ಈ", "G": "ಉ", "H": "ಊ", "I": "ಋ", "J": "ಎ", "K": "ಏ",
          "L": "ಐ", "M": "ಒ", "N": "ಓ", "O": "ಔ"}
OTTU = {"Ì": "ಕ", "Í": "ಖ", "Î": "ಗ", "Ï": "ಘ", "Ñ": "ಚ", "Ò": "ಛ", "Ó": "ಜ", "Ô": "ಝ", "Õ": "ಞ", "Ö": "ಟ", "×": "ಠ", "Ø": "ಡ",
        "Ù": "ಢ", "Ú": "ಣ", "Û": "ತ", "Ü": "ಥ", "Ý": "ದ", "Þ": "ಧ", "ß": "ನ", "à": "ಪ", "á": "ಫ", "â": "ಬ", "ã": "ಭ", "ä": "ಮ",
        "å": "ಯ", "æ": "ರ", "ç": "ರ", "è": "ಲ", "é": "ವ", "ê": "ಶ", "ë": "ಷ", "ì": "ಸ", "í": "ಹ", "î": "ಳ"}
SIGNS = set("ÀÁÂÃÄÅÆÇÈÉÊËïðsüiöø÷")
# Spacers: pieces with no letter of their own, which shift the next piece into place (ಸಂಸ್ಕೃತಿ ¸ÀA¸ÀÌöÈw, ತತ್ತ್ವ vÀvÀÛ÷é).
SPACERS = set("ö÷")
ASPIRATE = {"ಡ": "ಢ", "ದ": "ಧ", "ಬ": "ಭ", "ಪ": "ಫ", "ಜ": "ಝ", "ಗ": "ಘ"}
OTHER = {"A": "ಂ", "B": "ಃ", "„": "ಽ", "|": "।", "`": "‘", "'": "’"}
PAIRS = {"||": "॥", "``": "“", "''": "”", "’’": "”", "‘‘": "“"}
MU = {"μ": "µ"}


def _vowel_sign(pieces):
    """The vowel sign (or virama) of a consonant body's sign pieces (a set)."""
    if "É" in pieces:
        if "Ê" in pieces:
            return "ೈ"
        if pieces & {"Æ", "Ç"}:
            return "ೋ" if "Ã" in pieces else "ೊ"
        return "ೇ" if "Ã" in pieces else "ೆ"
    if "ï" in pieces:
        return VIRAMA
    if "Â" in pieces:
        return "ೀ" if "Ã" in pieces else "ಿ"
    for p, s in (("Á", "ಾ"), ("Ë", "ೌ"), ("È", "ೃ"), ("ø", "ೃ"), ("Æ", "ೂ"), ("Ç", "ೂ"), ("Ä", "ು"), ("Å", "ು")):
        if p in pieces:
            return s
    return ""


def convert(text):
    """(Unicode text, [pieces not placed]) for legacy-encoded text."""
    t = "".join(MU.get(c, c) for c in text)
    # No word starts with a dependent piece: a space before one is the PDF's gap inside a syllable (ಬೇರೆಲ್ಲೂ ¨ÉÃgÉ®Æ è).
    t = re.sub("[ ]+(?=[" + re.escape("".join(sorted((SIGNS | set(OTTU)) - {"i", "s"}))) + "])", "", t)
    out, unplaced, i, n = [], [], 0, len(t)
    while i < n:
        c = t[i]
        two = t[i:i + 2]
        if two in PAIRS:
            out.append(PAIRS[two]); i += 2; continue
        if two == "Ai" or c in BODY or c in WITH_I or c in WHOLE:
            base = "Ai" if two == "Ai" else c
            i += len(base)
            pieces = []
            while i < n and (t[i] in SIGNS or t[i] in OTTU) and not (t[i] == "A" and t[i + 1:i + 2] == "i"):
                pieces.append(t[i]); i += 1
            # Anusvara and visarga close the syllable.
            tail = ""
            while i < n and t[i] in "AB" and t[i:i + 2] != "Ai":
                tail += OTHER[t[i]]; i += 1
            out.append(_syllable(base, pieces, unplaced) + tail)
            continue
        if two in VOWELS:
            out.append(VOWELS[two]); i += 2; continue
        if c in VOWELS:
            out.append(VOWELS[c]); i += 1; continue
        if c in OTHER:
            out.append(OTHER[c]); i += 1; continue
        if c in SIGNS or c in OTTU:
            unplaced.append(c); i += 1; continue
        out.append(c); i += 1
    return unicodedata.normalize("NFC", "".join(out)), unplaced


def _syllable(base, pieces, unplaced):
    ps = [p for p in pieces if p not in SPACERS]
    kind = "i" if base in WITH_I else "whole" if base in WHOLE else "body"
    cons = WITH_I.get(base) or WHOLE.get(base) or BODY.get(base) or "ಯ"
    # The hook of ಮ and ಯ: right after À or É (or right after the i form), Ä or i belongs to the letter.
    hooked = base in ("ª", "Ai", "«", "¬")
    if hooked:
        k = 0 if kind == "i" else (1 if ps[:1] in (["À"], ["É"]) else None)
        if k is not None and ps[k:k + 1] in (["Ä"], ["i"]):
            del ps[k]
            if base in ("ª", "«"):
                cons = "ಮ"
        elif base == "ª" and "Æ" in ps:
            cons = "ಮ"
        elif base in ("Ai", "¬"):
            cons = "ಯ"
    if "s" in ps or "ü" in ps:
        cons = ASPIRATE.get(cons, cons)
    ottus = [OTTU[p] for p in ps if p in OTTU]
    signs = {p for p in ps if p in SIGNS}
    if kind == "i":
        vowel = "ೀ" if "Ã" in signs else "ಿ"
        extra = signs - {"Ã", "ð", "s", "ü"}
    else:
        # A whole letter (ಖ R, ಬ §) has its head stroke; it may still take ು or ೂ (ಬು §Ä, ಬೂ §Æ).
        vowel = _vowel_sign(signs)
        extra = signs - {"À", "Á", "Â", "Ã", "Ä", "Å", "Æ", "Ç", "È", "É", "Ê", "Ë", "ï", "ð", "s", "ü", "ø"}
        # Two u signs (ಮು written ªÀÄÄ keeps one Ä after the hook; anything more is out of place).
        if [p for p in ps if p in "ÄÅ"][1:]:
            extra |= {"Ä"}
    unplaced.extend(sorted(extra))
    return ("ರ" + VIRAMA if "ð" in signs else "") + cons + "".join(VIRAMA + o for o in ottus) + vowel
