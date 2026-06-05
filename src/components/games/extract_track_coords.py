#!/usr/bin/env python3
"""
F1 Track Coordinate Extractor
==============================
Liest eine SVG-Datei (z.B. von der offiziellen F1-Website) und extrahiert
die Mittellinie der Rennstrecke als normalisierte XY-Koordinaten.

Verwendung:
    python extract_track_coords.py canada.svg
    python extract_track_coords.py canada.svg --output canada.json --samples 300
    python extract_track_coords.py canada.svg --preview   # zeigt einen Plot

Abhängigkeiten:
    pip install svgpathtools numpy matplotlib
"""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

# ─── Konfiguration ────────────────────────────────────────────────────────────

# Diese Layer-IDs enthalten typischerweise die Streckenmittellinie in
# offiziellen F1-SVGs (Adobe Illustrator Export). Passe sie bei Bedarf an.
PREFERRED_IDS = [
    "Path-173",   # Canada – Mittellinie (innerste Linie = Referenzpfad)
    "Path-172",
    "Path-171",
    "Path-17",
    "Circuit",
    "track",
    "Track",
    "centerline",
    "Centerline",
]

# Klassen, die die äußere Streckenfläche beschreiben (werden ignoriert)
SKIP_CLASSES = {"st17", "st20", "st11", "st12", "st13"}


# ─── SVG Namespace Helper ──────────────────────────────────────────────────────

NS = {"svg": "http://www.w3.org/2000/svg"}


def strip_ns(tag: str) -> str:
    """Entfernt XML-Namespace-Präfixe aus einem Tag-Namen."""
    return re.sub(r"\{[^}]+\}", "", tag)


# ─── Pfad-Extraktion ──────────────────────────────────────────────────────────

def find_track_path(svg_file: str) -> tuple[str, str]:
    """
    Sucht in der SVG-Datei nach dem besten Kandidaten für die Streckenmittellinie.
    Gibt (path_d, element_id) zurück.
    """
    tree = ET.parse(svg_file)
    root = tree.getroot()

    # 1. Bevorzugte IDs zuerst probieren
    all_paths = {}
    for elem in root.iter():
        tag = strip_ns(elem.tag)
        if tag == "path":
            eid = elem.get("id", "")
            cls = elem.get("class", "")
            d = elem.get("d", "")
            if d and cls not in SKIP_CLASSES:
                all_paths[eid] = (d, cls)

    for preferred in PREFERRED_IDS:
        if preferred in all_paths:
            print(f"✓ Streckenpfad gefunden: id='{preferred}'")
            return all_paths[preferred][0], preferred

    # 2. Fallback: längsten Pfad nehmen (meist die Strecke)
    if all_paths:
        longest_id = max(all_paths, key=lambda k: len(all_paths[k][0]))
        print(f"⚠ Kein bevorzugter Pfad gefunden. Verwende längsten Pfad: id='{longest_id}'")
        return all_paths[longest_id][0], longest_id

    raise ValueError("Keine Pfad-Elemente in der SVG-Datei gefunden!")


# ─── SVG Path → Punkte ────────────────────────────────────────────────────────

def sample_svg_path(d: str, num_samples: int = 200) -> np.ndarray:
    """
    Schnelles Sampling: gleichmäßig über t=0..1 (kein ilength).
    Für ein Rennspiel mehr als ausreichend.
    """
    try:
        from svgpathtools import parse_path
    except ImportError:
        print("Fehler: 'svgpathtools' nicht installiert.")
        print("Bitte ausführen: pip install svgpathtools")
        sys.exit(1)

    path = parse_path(d)
    points = []
    for i in range(num_samples):
        t = i / num_samples
        pt = path.point(t)
        points.append((pt.real, pt.imag))

    return np.array(points)


# ─── Normalisierung ───────────────────────────────────────────────────────────

def normalize(points: np.ndarray, target_size: int = 1000) -> np.ndarray:
    """
    Normalisiert die Koordinaten so, dass sie in ein Quadrat der
    Größe target_size × target_size passen (mit Padding).
    Y-Achse wird gespiegelt (SVG hat Y nach unten, Canvas nach oben).
    """
    # Y-Achse spiegeln
    points = points.copy()
    points[:, 1] = -points[:, 1]

    min_x, min_y = points.min(axis=0)
    max_x, max_y = points.max(axis=0)

    width  = max_x - min_x
    height = max_y - min_y
    scale  = (target_size * 0.9) / max(width, height)

    points[:, 0] = (points[:, 0] - min_x) * scale + target_size * 0.05
    points[:, 1] = (points[:, 1] - min_y) * scale + target_size * 0.05

    return points


# ─── Export ───────────────────────────────────────────────────────────────────

def export_json(points: np.ndarray, output_file: str, track_name: str):
    """Speichert die Koordinaten als JSON-Datei."""
    data = {
        "track": track_name,
        "coordinate_system": "canvas (y nach unten, origin oben-links)",
        "normalized_to": 1000,
        "point_count": len(points),
        "points": [[round(float(x), 2), round(float(y), 2)] for x, y in points],
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"✓ Koordinaten gespeichert: {output_file}")
    print(f"  {len(points)} Punkte, normalisiert auf 1000×1000")


def show_preview(points: np.ndarray, track_name: str):
    """Zeigt eine Vorschau der extrahierten Strecke."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("⚠ matplotlib nicht installiert – kein Preview möglich.")
        print("  pip install matplotlib")
        return

    fig, ax = plt.subplots(figsize=(10, 8))
    ax.plot(points[:, 0], points[:, 1], "b-", linewidth=2, label="Streckenmittellinie")
    ax.plot(points[0, 0], points[0, 1], "go", markersize=10, label="Start")
    ax.plot(points[-1, 0], points[-1, 1], "rs", markersize=8, label="Ende")
    ax.set_aspect("equal")
    ax.invert_yaxis()   # Canvas-Koordinatensystem
    ax.set_title(f"F1 Strecke: {track_name}")
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.show()


# ─── Batch-Modus ──────────────────────────────────────────────────────────────

def process_multiple(svg_files: list[str], samples: int = 200) -> dict:
    """
    Verarbeitet mehrere SVG-Dateien auf einmal.
    Gibt ein Dict mit {track_name: [points]} zurück.
    """
    results = {}
    for svg_file in svg_files:
        name = Path(svg_file).stem
        print(f"\n── Verarbeite: {name} ──")
        try:
            d, path_id = find_track_path(svg_file)
            raw_points = sample_svg_path(d, num_samples=samples)
            norm_points = normalize(raw_points)
            results[name] = norm_points.tolist()
            print(f"  {len(norm_points)} Punkte extrahiert")
        except Exception as e:
            print(f"  Fehler: {e}")
    return results


# ─── Haupt-Einstiegspunkt ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Extrahiert Streckenmittellinie aus F1-SVG-Dateien"
    )
    parser.add_argument(
        "svg_files",
        nargs="+",
        help="Eine oder mehrere SVG-Dateien (z.B. canada.svg monaco.svg)"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Ausgabedatei (JSON). Standard: <track_name>.json"
    )
    parser.add_argument(
        "--samples", "-s",
        type=int,
        default=200,
        help="Anzahl der Punkte entlang der Strecke (Standard: 200)"
    )
    parser.add_argument(
        "--preview", "-p",
        action="store_true",
        help="Zeigt einen Plot der extrahierten Strecke"
    )
    parser.add_argument(
        "--list-paths",
        action="store_true",
        help="Listet alle Pfad-IDs in der SVG auf (zur Diagnose)"
    )
    args = parser.parse_args()

    # Diagnose-Modus: alle Pfade auflisten
    if args.list_paths:
        for svg_file in args.svg_files:
            print(f"\nPfade in '{svg_file}':")
            tree = ET.parse(svg_file)
            for elem in tree.getroot().iter():
                if strip_ns(elem.tag) == "path":
                    eid  = elem.get("id", "(kein ID)")
                    cls  = elem.get("class", "")
                    dlen = len(elem.get("d", ""))
                    print(f"  id='{eid}'  class='{cls}'  d-Länge={dlen}")
        return

    # Mehrere Dateien → alles in eine JSON
    if len(args.svg_files) > 1:
        results = process_multiple(args.svg_files, samples=args.samples)
        out = args.output or "all_tracks.json"
        with open(out, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\n✓ Alle Strecken gespeichert in: {out}")
        return

    # Einzelne Datei
    svg_file = args.svg_files[0]
    track_name = Path(svg_file).stem

    print(f"Verarbeite: {svg_file}")
    d, path_id = find_track_path(svg_file)

    print(f"Sampling mit {args.samples} Punkten...")
    raw_points = sample_svg_path(d, num_samples=args.samples)

    print("Normalisiere Koordinaten...")
    norm_points = normalize(raw_points)

    out_file = args.output or f"{track_name}.json"
    export_json(norm_points, out_file, track_name)

    if args.preview:
        show_preview(norm_points, track_name)


if __name__ == "__main__":
    main()
