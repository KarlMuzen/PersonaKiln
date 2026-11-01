import React from 'react';
import { MessageSquare, Bot, User, History } from 'lucide-react';
import type { ChatMessage } from '../../services/conversationEngine';
import { TESTER_PERSONAS, type TesterPersona } from '../../services/testerPersona';
import { renderPlainLanguageScoreSummary } from './DiagnosticScorePanel';
import type { ConnectionProfile } from '../../db';

export interface TranscriptViewerProps {
  simulatedTranscript: ChatMessage[];
  isSimulatingScenario: boolean;
  selectedPersona: TesterPersona;
  characterName: string;
  simSpeakerTyping: string | null;
  onClearTranscript: () => void;
  scenarioHistory: {
    id: string;
    name: string;
    persona: string;
    turnCount: number;
    lastRunResult?: Record<
      string,
      {
        error?: string;
        transcript?: { role: string; text: string; speakerUuid?: string; speakerName?: string }[];
        scores?: {
          agendaHeld: boolean;
          tellConsistency: number;
          loreDelivery: number;
          driftOnsetTurn: number | null;
          reasoning: string;
        };
      }
    >;
  }[];
  profiles: ConnectionProfile[];
  activeCardUuid?: string | null;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  simulatedTranscript,
  isSimulatingScenario,
  selectedPersona,
  characterName,
  simSpeakerTyping,
  onClearTranscript,
  scenarioHistory,
  profiles,
  activeCardUuid,
}) => {
  return (
    <div className="space-y-4">
      {/* Simulated Transcript Display */}
      {simulatedTranscript.length > 0 ? (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-knight-800 pb-2">
            <span className="text-xs font-semibold text-mist-200 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-maroon-400" />
              Simulated Conversation Transcript ({simulatedTranscript.length} messages)
            </span>
            <button
              onClick={onClearTranscript}
              disabled={isSimulatingScenario}
              className="text-xs text-knight-400 hover:text-mist-200 disabled:opacity-50 min-h-9 px-2.5 py-1 rounded-lg hover:bg-void-800 transition-colors touch-fast active:scale-95"
            >
              Clear Transcript
            </button>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 bg-void-950 p-4 rounded-xl border border-knight-800/80 custom-scrollbar">
            {simulatedTranscript.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                  <span className="text-[10px] text-knight-400 font-medium px-1 flex items-center gap-1">
                    {isUser ? (
                      <>
                        Simulated User ({TESTER_PERSONAS[selectedPersona]?.name || selectedPersona}){' '}
                        <User className="w-3 h-3 text-knight-400" />
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3 text-maroon-400" /> {msg.speakerName || characterName}
                      </>
                    )}
                  </span>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words select-text ${
                      isUser
                        ? 'bg-knight-800/90 text-mist-100 rounded-tr-none border border-knight-700/60'
                        : 'bg-void-900 text-mist-200 rounded-tl-none border border-knight-800/80 font-serif'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}

            {simSpeakerTyping && (
              <div className="flex items-center gap-2 text-xs text-knight-400 italic pt-1">
                <Bot className="w-3.5 h-3.5 text-maroon-400 animate-bounce" />
                <span>{simSpeakerTyping} is replying...</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 bg-void-950/40 border border-knight-800/60 rounded-xl text-center text-xs text-knight-500">
          Click <strong>Run Scenario</strong> to run a scripted conversation against this card.
        </div>
      )}

      {/* Scenario History */}
      {scenarioHistory.filter((s) => s.id !== 'scripted_template').length > 0 && (
        <div className="space-y-4 pt-4 border-t border-knight-800/80">
          <h4 className="text-xs font-semibold text-mist-300 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-knight-400" />
            Scenario Run History
          </h4>
          <div className="space-y-4">
            {scenarioHistory
              .filter((s) => s.id !== 'scripted_template')
              .map((scenario) => {
                const pInfo = TESTER_PERSONAS[scenario.persona as TesterPersona];
                const profKeys = scenario.lastRunResult ? Object.keys(scenario.lastRunResult) : [];
                return (
                  <div key={scenario.id} className="p-3 bg-void-950/60 border border-knight-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-knight-800/60 pb-2">
                      <span className="text-[12px] font-semibold text-mist-200">
                        {pInfo?.name || scenario.persona} — {scenario.turnCount} turns
                      </span>
                      <span className="text-[10px] text-knight-500">
                        {new Date(parseInt(scenario.id) || 0).toLocaleString() !== 'Invalid Date' &&
                        parseInt(scenario.id) > 1000000000000
                          ? new Date(parseInt(scenario.id)).toLocaleString()
                          : scenario.name}
                      </span>
                    </div>

                    {profKeys.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {profKeys.map((profUuid) => {
                          const res = scenario.lastRunResult![profUuid];
                          const score = res.scores;
                          const prof = profiles.find((p) => p.uuid === profUuid);
                          return (
                            <div
                              key={profUuid}
                              className="p-3 bg-void-900 border border-knight-700/60 rounded-xl space-y-2"
                            >
                              <div className="text-[11px] font-semibold text-mist-100 pb-1 border-b border-knight-800/80 mb-2 truncate">
                                {prof ? prof.name || prof.provider : 'Unknown Profile'}
                              </div>
                              {res.error ? (
                                <div className="text-[10px] text-red-400 italic">Error: {res.error}</div>
                              ) : res.transcript ? (
                                <div className="space-y-1.5 text-[11px] leading-relaxed">
                                  <p className="text-emerald-400 font-medium">
                                    Simulation Complete ({res.transcript.length} messages logged)
                                  </p>
                                  {renderPlainLanguageScoreSummary(score, res.transcript, activeCardUuid || undefined)}
                                  {res.transcript.length > 0 && (
                                    <div className="bg-void-950 p-2 rounded-md border border-knight-800 text-knight-300 italic text-[10px] line-clamp-3 mt-1.5">
                                      <span className="font-semibold text-mist-400 block mb-0.5 not-italic">
                                        Latest message
                                        {res.transcript[res.transcript.length - 1].speakerName
                                          ? ` (${res.transcript[res.transcript.length - 1].speakerName})`
                                          : ''}
                                        :
                                      </span>
                                      "{res.transcript[res.transcript.length - 1].text}"
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[10px] text-knight-500 italic">No transcript recorded</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[10px] text-knight-500 italic">No results</div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
