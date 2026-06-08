// ── Track-Registry ────────────────────────────────────────────────────────────
// Neuen Track hinzufügen:
//   1. Datei anlegen:  ./meintrack.track.js  (gleiche Struktur wie monaco.track.js)
//   2. Hier importieren und in ALL_TRACKS eintragen – fertig.
//      Die Komponente zeigt ihn dann automatisch in der Auswahl an.

import { MONACO_TRACK }    from './monaco.track.js'
import { BARCELONA_TRACK } from './barcelona.track.js'
import { AUSTRIA_TRACK }   from './austria.track.js'

/**
 * Reihenfolge bestimmt die Anzeige im Track-Selector.
 * Jedes Objekt muss mindestens folgende Felder haben:
 *   id, name, points, scale, trackWidth, buffer, startIndex
 */
export const ALL_TRACKS = [
  MONACO_TRACK,
  BARCELONA_TRACK,
  AUSTRIA_TRACK,
]

/** Gibt den Track mit der passenden id zurück, Fallback: erster Track */
export function getTrackById(id) {
  return ALL_TRACKS.find(t => t.id === id) ?? ALL_TRACKS[0]
}
