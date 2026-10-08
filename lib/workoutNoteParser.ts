import type { Exercise } from '../data/exercises';

export type ParsedNoteMove = { name: string; sets: number; reps: number; weight: number };
export type ParsedNoteSplit = { name: string; moves: ParsedNoteMove[] };

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const splitTitle = /^(?:(?:day\s*\d+\s*[:.—-]?\s*)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday\s*[-:—]?\s*))?(push|pull|legs?|upper(?:\s+body)?|lower(?:\s+body)?|full(?:\s+body)?|chest(?:\s+and\s+triceps)?|back(?:\s+and\s+biceps)?|arms?|shoulders?)(?:\s+(?:day|workout|split|session))?\s*:?$/i;

function bestExerciseMatch(name: string, catalog: Exercise[]): Exercise | undefined {
  const normalized = clean(name);
  if (!normalized) return undefined;
  const exact = catalog.find((exercise) => clean(exercise.name) === normalized);
  if (exact) return exact;
  const words = new Set(normalized.split(' ').filter((word) => word.length > 2));
  let best: Exercise | undefined;
  let bestScore = 0;
  for (const exercise of catalog) {
    const candidateWords = new Set(clean(exercise.name).split(' ').filter((word) => word.length > 2));
    if (!candidateWords.size) continue;
    const overlap = [...words].filter((word) => candidateWords.has(word)).length;
    const score = overlap / Math.max(words.size, candidateWords.size);
    if (score > bestScore) {
      bestScore = score;
      best = exercise;
    }
  }
  return bestScore >= 0.58 ? best : undefined;
}

function parseMove(line: string, catalog: Exercise[]): ParsedNoteMove | null {
  const raw = line.replace(/^\s*(?:[-*•▪]+|\d+[.)])\s*/, '').trim();
  if (!raw || /^\s*(?:notes?|warm\s*up|cool\s*down|superset|rest|equipment)\s*:/i.test(raw)) return null;

  const combined = raw.match(/(\d+)\s*(?:sets?\s*(?:x|×|of)\s*|sets?\s+)(\d+)\s*(?:reps?)?/i)
    ?? raw.match(/(\d+)\s*[x×]\s*(\d+)\s*(?:reps?)?/i);
  const setsMatch = raw.match(/(\d+)\s*sets?/i);
  const repsMatch = raw.match(/(?:x|×|of)\s*(\d+)\s*(?:reps?)?/i) ?? raw.match(/(\d+)\s*reps?/i);
  const setCount = Math.max(1, Math.min(12, Number(combined?.[1] ?? setsMatch?.[1] ?? 3)));
  const repCount = Math.max(1, Math.min(100, Number(combined?.[2] ?? repsMatch?.[1] ?? 10)));
  const weightMatch = raw.match(/(?:@|at|with)?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)\b/i);
  let weight = weightMatch ? Number(weightMatch[1]) : 0;
  if (weightMatch && /lb/i.test(weightMatch[2])) weight = Math.round(weight * 0.453592 * 10) / 10;

  const name = raw
    .replace(/(?:@|at|with)?\s*\d+(?:\.\d+)?\s*(?:kg|kgs|lb|lbs)\b/ig, '')
    .replace(/\d+\s*(?:sets?\s*(?:x|×|of)\s*|sets?\s+)(?:\d+\s*(?:reps?)?)?/ig, '')
    .replace(/\d+\s*[x×]\s*\d+\s*(?:reps?)?/ig, '')
    .replace(/\d+\s*reps?/ig, '')
    .replace(/[|,;:@—–-]+\s*$/g, '')
    .replace(/[|:—–-]+/g, ' ')
    .trim();
  if (!name || /^(?:sets?|reps?|kg|lbs?)$/i.test(name)) return null;
  const match = bestExerciseMatch(name, catalog);
  // Do not interpret section labels or arbitrary prose as exercises.
  if (!combined && !setsMatch && !repsMatch && !weightMatch && !match) return null;
  return { name: match?.name ?? name, sets: setCount, reps: repCount, weight };
}

export function parseWorkoutNote(text: string, catalog: Exercise[]): ParsedNoteSplit[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const groups: ParsedNoteSplit[] = [];
  let current: ParsedNoteSplit | null = null;
  const start = (name: string) => {
    current = { name: name.replace(/^#+\s*/, '').trim() || 'Imported workout', moves: [] };
    groups.push(current);
  };

  for (const original of lines) {
    const line = original.replace(/^#+\s*/, '').trim();
    const titleMatch = line.match(splitTitle);
    if (titleMatch) {
      start(`${titleMatch[1][0].toUpperCase()}${titleMatch[1].slice(1)}${/day|workout|split|session/i.test(line) ? ' Day' : ''}`);
      continue;
    }
    const move = parseMove(line, catalog);
    if (!move) continue;
    if (!current) {
      const firstLine = lines[0]?.replace(/^#+\s*/, '').trim() ?? '';
      start(firstLine && firstLine !== original && !parseMove(firstLine, catalog) ? firstLine : 'Imported workout');
    }
    current!.moves.push(move);
  }
  return groups.filter((group) => group.moves.length > 0);
}
