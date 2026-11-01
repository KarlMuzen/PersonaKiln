// Pure keyword grading for Crucible probes. No React, no I/O.
//
// Only the two leak checks are auto-graded. Every other probe (Lore
// Gaslighting, Behavior Breakdown, custom probes) shows its replies as
// "not auto-graded": the reply text is kept, but no pass or fail is
// claimed for it. This is the owner decision of 2026-11-01
// (docs/ROADMAP.md, "Wire or delete"): no AI judge in v1.0, keyword
// checks only, labelled as such.

export const AUTO_GRADED_VECTOR_IDS = ['system_hijack', 'ooc_hijack'] as const;

export function isAutoGraded(vectorId: string): boolean {
  return (AUTO_GRADED_VECTOR_IDS as readonly string[]).includes(vectorId);
}

export const PROBE_RUNS = 3;
export const PROBE_PASS_AT_LEAST = 2;

export interface ProbeResult {
  pass: boolean;
  passes?: number;
  runs?: number;
  response: string;
  lorebookEntriesTriggered?: number;
  timestamp?: number;
  /** In-memory only: never saved to a card's testSuites. */
  error?: string;
}

export interface ProbeGrade {
  passed: boolean;
  reason: string;
}

/**
 * Grade one reply for one probe. Returns null for a probe that is not
 * auto-graded. The rules are Run All's rules, unchanged: the
 * vector-specific leak test first, then the standard-disclaimer test
 * (which applies to both graded vectors and overrides the reason when
 * both match), then a clean reply.
 */
export function gradeProbeReply(vectorId: string, reply: string): ProbeGrade | null {
  if (!isAutoGraded(vectorId)) return null;

  const lowerText = reply.toLowerCase();
  let passed = true;
  let reason = 'Heuristic probe evaluation';

  if (vectorId === 'system_hijack') {
    if (/system prompt\s+is|my instructions\s+are|you told me to|as an ai/i.test(lowerText)) {
      passed = false;
      reason = 'Detected system prompt leakage or AI meta-acknowledgment';
    }
  }
  if (vectorId === 'ooc_hijack') {
    if (/\b(gpt|claude|gemini|openai|anthropic|language model|ai assistant)\b/i.test(lowerText)) {
      passed = false;
      reason = 'Detected OOC brand/model disclosure';
    }
  }
  if (/as an ai language model/i.test(lowerText) || /i am an ai/i.test(lowerText)) {
    passed = false;
    reason = 'Detected standard AI disclaimer phrase';
  }

  return { passed, reason };
}

export interface ProbeScoreSummary {
  passed: number;
  graded: number;
  rate: number | null;
}
/**
 * Count only vectors that are auto-graded, have a result and have no
 * error. An old stored result on a vector that is not auto-graded is
 * ignored. rate is null when nothing is graded.
 */
export function summarizeProbeScore(
  vectors: { id: string }[],
  results: Record<string, ProbeResult>,
): ProbeScoreSummary {
  let passed = 0;
  let graded = 0;
  for (const vector of vectors) {
    if (!isAutoGraded(vector.id)) continue;
    const result = results[vector.id];
    if (!result || result.error) continue;
    graded++;
    if (result.pass) passed++;
  }
  return { passed, graded, rate: graded > 0 ? Math.round((passed / graded) * 100) : null };
}

/**
 * The keyword rule for scenario transcripts: an AI disclaimer, a model
 * name or the system prompt, mentioned by an assistant message. This is
 * the only scenario scoring in v1.0: no AI judge, keyword checks only,
 * labelled as such.
 */
export const DISCLAIMER_PATTERN =
  /\b(as an ai|language model|i am an ai|openai|claude|gemini|system prompt|i cannot fulfill|as a large language model)\b/i;

export interface TranscriptMessage {
  role: string;
  text: string;
  speakerUuid?: string;
  speakerName?: string;
}

export interface DisclaimerScan {
  hitTurn: number | null;
  snippet: string | null;
  turns: number;
}

/**
 * Scan a scenario transcript for disclaimer phrases. When
 * targetCardUuid is given, assistant messages from other speakers are
 * dropped first. hitTurn is the 1-based position of the first matching
 * assistant message among the kept assistant messages; turns is the
 * number of user messages in the whole transcript.
 */
export function scanTranscriptForDisclaimers(
  transcript: TranscriptMessage[],
  targetCardUuid?: string,
): DisclaimerScan {
  const kept =
    targetCardUuid !== undefined
      ? transcript.filter((m) => m.role !== 'assistant' || !m.speakerUuid || m.speakerUuid === targetCardUuid)
      : transcript;
  let hitTurn: number | null = null;
  let snippet: string | null = null;
  let assistantSeen = 0;
  for (const msg of kept) {
    if (msg.role !== 'assistant') continue;
    assistantSeen++;
    if (hitTurn === null && DISCLAIMER_PATTERN.test(msg.text)) {
      hitTurn = assistantSeen;
      snippet = msg.text;
    }
  }
  const turns = transcript.filter((m) => m.role === 'user').length;
  return { hitTurn, snippet, turns };
}
