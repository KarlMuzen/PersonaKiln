import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { CrucibleVector, ConnectionProfile } from '../../db';
import type { CharacterCardV3 } from '../../schemas/cardSchema';
import { scanLorebook } from '../../utils/lorebookScan';
import { resolveMacros } from '../../utils/macroParser';
import { sendSingleLLMRequest } from '../../services/llmAdapter';
import {
  gradeProbeReply,
  isAutoGraded,
  PROBE_PASS_AT_LEAST,
  PROBE_RUNS,
  type ProbeResult,
} from '../../utils/crucibleGrading';

export interface DiagnosticScores {
  agendaHeld?: boolean;
  tellConsistency?: number;
  openerQuality?: number;
  loreDelivery?: number;
  driftOnsetTurn?: number | null;
  reasoning?: string;
}

export function safeExtractAndParseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch (_e) {
    // ignore
  }

  let clean = text.trim();
  if (clean.includes('```')) {
    const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (_e) {
        clean = match[1].trim();
      }
    } else {
      clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
    }
  }

  const start = clean.indexOf('{');
  if (start !== -1) {
    let braceCount = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < clean.length; i++) {
      const char = clean[i];
      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = !inString;
      } else if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            let jsonString = clean.substring(start, i + 1);
            jsonString = jsonString.replace(/,\s*([\}\]])/g, '$1');
            try {
              return JSON.parse(jsonString);
            } catch (_e) {
              break;
            }
          }
        }
      }
    }
  }

  throw new Error('No valid JSON block could be extracted and parsed.');
}

export function renderPlainLanguageScoreSummary(
  scores: DiagnosticScores | null | undefined,
  transcript?: { role: string; text: string; speakerUuid?: string; speakerName?: string }[],
  targetCardUuid?: string
) {
  if (!scores && (!transcript || transcript.length === 0)) return null;

  let driftTurn: number | null = typeof scores?.driftOnsetTurn === 'number' ? scores.driftOnsetTurn : null;
  let snippet: string | null = null;
  let driftReasoning = scores?.reasoning || '';

  const evaluatedTranscript =
    transcript && targetCardUuid
      ? transcript.filter((m) => m.role !== 'assistant' || !m.speakerUuid || m.speakerUuid === targetCardUuid)
      : transcript;

  if (evaluatedTranscript && evaluatedTranscript.length > 0) {
    if (driftTurn !== null && driftTurn > 0) {
      const assistantMsgs = evaluatedTranscript.filter((m) => m.role === 'assistant');
      const targetMsg = assistantMsgs[driftTurn - 1] || assistantMsgs[assistantMsgs.length - 1];
      if (targetMsg) {
        snippet = targetMsg.text;
      }
    } else if (driftTurn === null) {
      for (let i = 0; i < evaluatedTranscript.length; i++) {
        const msg = evaluatedTranscript[i];
        if (msg.role === 'assistant') {
          const lower = msg.text.toLowerCase();
          if (
            /\b(as an ai|language model|i am an ai|openai|claude|gemini|system prompt|i cannot fulfill|as a large language model)\b/i.test(
              lower
            )
          ) {
            const assistantIndex = evaluatedTranscript
              .slice(0, i + 1)
              .filter((m) => m.role === 'assistant').length;
            driftTurn = assistantIndex || Math.floor(i / 2) + 1;
            snippet = msg.text;
            driftReasoning = 'Assistant broke character and acknowledged AI constraints or system metadata.';
            break;
          }
        }
      }
    }
  }

  const getConsistencySummary = (val?: number) => {
    if (val === undefined || val === null) return null;
    if (val >= 5) return 'Flawless persona preservation';
    if (val >= 4) return 'Solid voice consistency';
    if (val >= 3) return 'Moderate consistency with minor voice shifts';
    if (val >= 2) return 'Weak consistency with noticeable persona slips';
    return 'Critical character break';
  };

  const getLoreSummary = (val?: number) => {
    if (val === undefined || val === null) return null;
    if (val >= 5) return 'Natural lore integration';
    if (val >= 4) return 'Good lore accuracy';
    if (val >= 3) return 'Basic lore inclusion';
    if (val >= 2) return 'Awkward or forced lore placement';
    return 'Lore ignored or hallucinated';
  };

  const consistencySummary = getConsistencySummary(scores?.tellConsistency);
  const loreSummary = getLoreSummary(scores?.loreDelivery);

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-knight-800/80 text-[11px]">
      {(consistencySummary || loreSummary || scores?.agendaHeld !== undefined) && (
        <div className="flex flex-wrap gap-1.5">
          {consistencySummary && (
            <span className="px-2 py-0.5 rounded bg-void-950 text-purple-300 border border-purple-800/60 font-medium">
              Voice: {consistencySummary}
            </span>
          )}
          {loreSummary && (
            <span className="px-2 py-0.5 rounded bg-void-950 text-blue-300 border border-blue-800/60 font-medium">
              Lore: {loreSummary}
            </span>
          )}
          {scores?.agendaHeld !== undefined && (
            <span
              className={`px-2 py-0.5 rounded font-medium border ${
                scores.agendaHeld
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                  : 'bg-red-950/80 text-red-300 border-red-800/60'
              }`}
            >
              Motive: {scores.agendaHeld ? 'Held internal agenda' : 'Abandoned agenda'}
            </span>
          )}
        </div>
      )}

      {driftTurn !== null ? (
        <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-lg space-y-1 text-red-200">
          <div className="flex items-center gap-1.5 font-semibold text-red-300">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>Character Drift Occurred at Turn {driftTurn}</span>
          </div>
          {driftReasoning && <p className="text-[10.5px] text-red-300/90">{driftReasoning}</p>}
          {snippet && (
            <div className="mt-1 p-2 bg-void-950/90 rounded border border-red-900/50 font-serif italic text-[10.5px] text-mist-200 break-words">
              <span className="font-sans font-semibold text-red-400 not-italic block text-[9.5px] uppercase tracking-wider mb-0.5">
                Drift Snippet (Turn {driftTurn}):
              </span>
              "{snippet.length > 200 ? snippet.slice(0, 200) + '...' : snippet}"
            </div>
          )}
        </div>
      ) : (
        <div className="p-2 bg-emerald-950/30 border border-emerald-800/50 rounded-lg flex items-center gap-1.5 text-emerald-300 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>No character drift detected across all turns.</span>
        </div>
      )}
    </div>
  );
}

export async function executeCrucibleVectorsOnCard(
  cardData: CharacterCardV3 | null | undefined,
  profile: ConnectionProfile | null | undefined,
  vectorsToRun: CrucibleVector[]
) {
  if (!profile) {
    throw new Error('No active connection profile configured for vector testing.');
  }

  const d = cardData?.data;
  const results: Record<string, ProbeResult> = {};
  const runTimestamp = Date.now();
  let capturedActualTokens: number | undefined;

  for (const vector of vectorsToRun) {
    try {
      let lorebookText = '';
      let lorebookEntriesTriggered = 0;
      if (d?.character_book) {
        const activeResults = scanLorebook(d.character_book, vector.prompt).activatedEntries;
        if (activeResults.length > 0) {
          const systemEntries: string[] = [];
          for (const r of activeResults) {
            systemEntries.push(r.cleanContent);
          }
          lorebookText = systemEntries.join('\n\n');
          lorebookEntriesTriggered = activeResults.length;
        }
      }

      const systemPromptStr =
        resolveMacros(
          [
            d?.system_prompt || '',
            d?.description ? `Description: ${d.description}` : '',
            d?.personality ? `Personality: ${d.personality}` : '',
            d?.scenario ? `Scenario: ${d.scenario}` : '',
            lorebookText ? `[Lorebook Information]\n${lorebookText}` : '',
            d?.post_history_instructions || '',
          ]
            .filter(Boolean)
            .join('\n\n') || 'Roleplay as character',
          { charName: d?.name || 'Character', userName: 'User' }
        );

      const REPEATS = PROBE_RUNS;
      let passCount = 0;
      const responsesTexts: string[] = [];

      for (let i = 0; i < REPEATS; i++) {
        const response = await sendSingleLLMRequest(profile, {
          systemPrompt: systemPromptStr,
          messages: [
            {
              role: 'user',
              content: vector.prompt,
            },
          ],
          temperature: 0.7,
          maxTokens: 150,
        });

        if (capturedActualTokens === undefined) {
          capturedActualTokens = response.promptTokens || response.tokensUsed;
        }

        const respText = response.text;
        const grade = gradeProbeReply(vector.id, respText);
        if (grade) {
          if (grade.passed) passCount++;
          responsesTexts.push(
            `[Run ${i + 1} - ${grade.passed ? 'PASS' : 'FAIL'}]\nResponse: ${respText}\nEval: ${grade.reason}`
          );
        } else {
          responsesTexts.push(`[Run ${i + 1}]\nResponse: ${respText}`);
        }
      }

      if (isAutoGraded(vector.id)) {
        results[vector.id] = {
          pass: passCount >= PROBE_PASS_AT_LEAST,
          passes: passCount,
          runs: REPEATS,
          response: responsesTexts.join('\n\n---\n\n'),
          lorebookEntriesTriggered,
          timestamp: runTimestamp,
        };
      } else {
        results[vector.id] = {
          pass: false,
          response: responsesTexts.join('\n\n---\n\n'),
          lorebookEntriesTriggered,
          timestamp: runTimestamp,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[vector.id] = {
        pass: false,
        response: `Error: ${message}`,
        error: message,
        lorebookEntriesTriggered: 0,
        timestamp: runTimestamp,
      };
    }
  }

  return { results, actualTokensUsed: capturedActualTokens };
}

export interface DiagnosticScorePanelProps {
  scores: DiagnosticScores | null | undefined;
  transcript?: { role: string; text: string; speakerUuid?: string; speakerName?: string }[];
  targetCardUuid?: string;
}

export const DiagnosticScorePanel: React.FC<DiagnosticScorePanelProps> = ({
  scores,
  transcript,
  targetCardUuid,
}) => {
  return <>{renderPlainLanguageScoreSummary(scores, transcript, targetCardUuid)}</>;
};

