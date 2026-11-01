import React, { useState, useRef, useEffect } from 'react';
import { Bot, Users, Square, Play, Plus, Trash2 } from 'lucide-react';
import type { StoredCard } from '../../db';
import { TESTER_PERSONAS, type TesterPersona } from '../../services/testerPersona';

export interface ScenarioPickerProps {
  groupMemberUuids: string[];
  toggleGroupMember: (uuid: string) => void;
  cards: StoredCard[];
  activeCardUuid: string | null;
  isSimulatingScenario: boolean;
  handleRunSimulation: () => void;
  handleStopSimulation: () => void;
  scenarioTurnCount: number;
  setScenarioTurnCount: (count: number) => void;
  scriptedTemplate: {
    id: string;
    name: string;
    persona: TesterPersona;
    turnCount: number;
    script?: { turnIndex: number; injectedMessage: string }[];
  };
  handleAddScriptEntry: (turnIndex: number, message: string) => void;
  handleRemoveScriptEntry: (turnIndex: number) => void;
  currentSimTurn: number;
  selectedPersona: TesterPersona;
}

export const ScenarioPicker: React.FC<ScenarioPickerProps> = ({
  groupMemberUuids,
  toggleGroupMember,
  cards,
  activeCardUuid,
  isSimulatingScenario,
  handleRunSimulation,
  handleStopSimulation,
  scenarioTurnCount,
  setScenarioTurnCount,
  scriptedTemplate,
  handleAddScriptEntry,
  handleRemoveScriptEntry,
  currentSimTurn,
  selectedPersona,
}) => {
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const groupPickerRef = useRef<HTMLDivElement>(null);
  const [newScriptTurnIndex, setNewScriptTurnIndex] = useState<number>(1);
  const [newScriptMessage, setNewScriptMessage] = useState<string>('');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (groupPickerRef.current && !groupPickerRef.current.contains(e.target as Node)) {
        setIsGroupPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onAddScript = () => {
    if (!newScriptMessage.trim()) return;
    handleAddScriptEntry(newScriptTurnIndex, newScriptMessage.trim());
    setNewScriptMessage('');
    setNewScriptTurnIndex((prev) => prev + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-knight-700/40 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-mist-100 flex items-center gap-2">
            <Bot className="w-4 h-4 text-maroon-400" />
            Scripted Scenario
          </h3>
          <p className="text-xs text-knight-400 mt-0.5">
            Runs a scripted multi-turn conversation against the card. The replies are scanned for AI-disclaimer phrases (keyword check); no AI scores them.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={groupPickerRef}>
            <button
              type="button"
              onClick={() => setIsGroupPickerOpen((prev) => !prev)}
              className={`p-2 rounded-xl transition-colors border touch-fast active:scale-95 relative flex items-center gap-1.5 text-xs font-medium ${
                groupMemberUuids.length > 0
                  ? 'text-amber-300 bg-amber-950/60 border-amber-700/80 hover:bg-amber-950/80 shadow-sm'
                  : 'text-knight-400 bg-void-950 border-knight-700/60 hover:text-mist-100 hover:bg-void-900'
              }`}
              title="Add characters to scene"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Add characters</span>
              {groupMemberUuids.length > 0 && (
                <span className="bg-maroon-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {groupMemberUuids.length}
                </span>
              )}
            </button>

            {isGroupPickerOpen && (
              <div className="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-void-900 border border-knight-700/60 rounded-xl shadow-2xl z-20 p-2">
                <p className="text-[10px] uppercase tracking-wider text-knight-500 font-mono px-1 pb-1.5">
                  Add characters to scene
                </p>
                {cards.filter((c) => c.uuid !== activeCardUuid).length === 0 ? (
                  <p className="text-[11px] text-knight-500 px-1 py-2">No other cards in your gallery yet.</p>
                ) : (
                  cards
                    .filter((c) => c.uuid !== activeCardUuid)
                    .map((c) => {
                      const checked = groupMemberUuids.includes(c.uuid);
                      return (
                        <button
                          key={c.uuid}
                          type="button"
                          onClick={() => toggleGroupMember(c.uuid)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                            checked ? 'bg-maroon-500/15 text-maroon-200' : 'hover:bg-void-800 text-mist-100'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                              checked ? 'bg-maroon-500 border-maroon-400' : 'border-knight-600'
                            }`}
                          >
                            {checked && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </button>
                      );
                    })
                )}
              </div>
            )}
          </div>

          {isSimulatingScenario ? (
            <button
              onClick={handleStopSimulation}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-900/80 hover:bg-red-800 text-white rounded-xl text-xs font-medium transition-all shadow-sm border border-red-700"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Simulation
            </button>
          ) : (
            <button
              onClick={handleRunSimulation}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 text-white rounded-xl text-xs font-medium transition-all shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              Run Scenario
            </button>
          )}
        </div>
      </div>

      {/* Persona & Turn Selection Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-knight-300">Select Tester Persona:</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-knight-400">Turn Length:</span>
            <select aria-label="Turn length"
              value={scenarioTurnCount}
              onChange={(e) => setScenarioTurnCount(Number(e.target.value))}
              disabled={isSimulatingScenario}
              className="bg-void-950 border border-knight-700/60 rounded px-2.5 py-1 text-xs text-mist-100 focus:outline-none disabled:opacity-50 font-mono"
            >
              <option value={5}>5 Turns</option>
              <option value={10}>10 Turns</option>
              <option value={20}>20 Turns</option>
              <option value={30}>30 Turns</option>
            </select>
          </div>
        </div>
      </div>

      {/* Scripted Probes Authoring UI */}
      {selectedPersona === 'scripted' && (
        <div className="p-3.5 bg-void-950/40 border border-knight-700/40 rounded-xl space-y-3">
          <h4 className="text-xs font-semibold text-knight-300 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-maroon-400" />
            Author Scripted Turn Injections
          </h4>
          <p className="text-[11px] text-knight-400">
            Define deterministic messages to inject at specific turn indices. Unscripted turns will wait for you to
            continue.
          </p>

          {scriptedTemplate.script && scriptedTemplate.script.length > 0 && (
            <div className="space-y-2">
              {scriptedTemplate.script.map((entry, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-void-900 border border-knight-800 rounded-lg"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-maroon-400">Turn {entry.turnIndex}</span>
                    <span className="text-xs text-mist-200 line-clamp-2">{entry.injectedMessage}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveScriptEntry(entry.turnIndex)}
                    aria-label={`Remove scripted turn ${entry.turnIndex}`}
                    className="p-2 min-w-9 min-h-9 flex items-center justify-center rounded-lg text-knight-500 hover:text-red-400 hover:bg-void-800 touch-fast active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-start">
            <div className="w-20 shrink-0">
              <input
                type="number"
                min="1"
                max="100"
                value={newScriptTurnIndex}
                onChange={(e) => setNewScriptTurnIndex(Number(e.target.value) || 1)}
                className="w-full px-3 py-1.5 bg-void-900 border border-knight-700/40 text-mist-100 text-xs rounded-xl focus:outline-none"
                placeholder="Turn"
              />
            </div>
            <input
              type="text"
              value={newScriptMessage}
              onChange={(e) => setNewScriptMessage(e.target.value)}
              placeholder="Message to inject..."
              className="flex-1 px-3 py-1.5 bg-void-900 border border-knight-700/40 text-mist-100 text-xs rounded-xl focus:outline-none"
            />
            <button
              onClick={onAddScript}
              disabled={!newScriptMessage.trim()}
              className="px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium transition-all shrink-0 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Live Simulation Status Banner */}
      {isSimulatingScenario && (
        <div className="p-3 bg-maroon-950/40 border border-maroon-800/80 rounded-xl flex items-center justify-between text-xs text-maroon-200 animate-pulse">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-maroon-400 animate-spin" />
            <span>
              Running simulated scenario: <strong>{TESTER_PERSONAS[selectedPersona]?.name || selectedPersona}</strong>
            </span>
          </div>
          <span className="font-mono text-maroon-300 font-semibold">
            Turn {currentSimTurn} / {scenarioTurnCount}
          </span>
        </div>
      )}
    </div>
  );
};
