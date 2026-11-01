import { useState, useRef, useMemo } from 'react';
import { useCardStore } from '../../store/useCardStore';
import { useDialogStore } from '../../store/useDialogStore';
import type { CrucibleScenario, StoredCard, ConnectionProfile } from '../../db';
import {
  buildInitialGreetingMessages,
  executeConversationTurn,
  type ChatMessage,
  type SceneCharacter,
} from '../../services/conversationEngine';
import type { TesterPersona } from '../../services/testerPersona';

export interface UseCrucibleRunParams {
  compareModels: boolean;
  targetProfiles: ConnectionProfile[];
  activeProfile?: ConnectionProfile;
}

export function useCrucibleRun({ compareModels, targetProfiles, activeProfile }: UseCrucibleRunParams) {
  const {
    activeCard,
    activeCardRecord,
    activeCardUuid,
    cards,
    updateActiveCardScenarios,
  } = useCardStore();

  const selectedPersona: TesterPersona = 'scripted';
  const [scenarioTurnCount, setScenarioTurnCount] = useState<number>(10);
  const [isSimulatingScenario, setIsSimulatingScenario] = useState<boolean>(false);
  const [currentSimTurn, setCurrentSimTurn] = useState<number>(0);
  const [simulatedTranscript, setSimulatedTranscript] = useState<ChatMessage[]>([]);
  const [simSpeakerTyping, setSimSpeakerTyping] = useState<string | null>(null);
  const [groupMemberUuids, setGroupMemberUuids] = useState<string[]>([]);
  const stopSimRef = useRef<boolean>(false);

  const toggleGroupMember = (uuid: string) => {
    setGroupMemberUuids((prev) =>
      prev.includes(uuid) ? prev.filter((u) => u !== uuid) : [...prev, uuid]
    );
  };

  const scriptedTemplate = useMemo(() => {
    const list =
      (activeCardRecord?.scenarios as {
        id: string;
        name: string;
        persona: TesterPersona;
        turnCount: number;
        script?: { turnIndex: number; injectedMessage: string }[];
      }[]) || [];
    return (
      list.find((s) => s.id === 'scripted_template') || {
        id: 'scripted_template',
        name: 'Scripted Probes Template',
        persona: 'scripted' as TesterPersona,
        turnCount: 10,
        script: [],
      }
    );
  }, [activeCardRecord?.scenarios]);

  const handleAddScriptEntry = (turnIndex: number, message: string) => {
    if (!message.trim()) return;
    const newScript = [...(scriptedTemplate.script || [])];
    const existingIndex = newScript.findIndex((s) => s.turnIndex === turnIndex);
    if (existingIndex >= 0) {
      newScript[existingIndex] = { turnIndex, injectedMessage: message };
    } else {
      newScript.push({ turnIndex, injectedMessage: message });
    }
    newScript.sort((a, b) => a.turnIndex - b.turnIndex);

    const rawScenarios = (activeCardRecord?.scenarios as (typeof scriptedTemplate)[]) || [];
    const scenarios = [...rawScenarios];
    const templateIdx = scenarios.findIndex((s) => s.id === 'scripted_template');
    if (templateIdx >= 0) {
      scenarios[templateIdx] = { ...scriptedTemplate, script: newScript };
    } else {
      scenarios.push({ ...scriptedTemplate, script: newScript });
    }
    updateActiveCardScenarios(scenarios as unknown as CrucibleScenario[]);
  };

  const handleRemoveScriptEntry = (turnIndex: number) => {
    const newScript = (scriptedTemplate.script || []).filter((s) => s.turnIndex !== turnIndex);
    const rawScenarios = (activeCardRecord?.scenarios as (typeof scriptedTemplate)[]) || [];
    const scenarios = [...rawScenarios];
    const templateIdx = scenarios.findIndex((s) => s.id === 'scripted_template');
    if (templateIdx >= 0) {
      scenarios[templateIdx] = { ...scriptedTemplate, script: newScript };
      updateActiveCardScenarios(scenarios as unknown as CrucibleScenario[]);
    }
  };

  const handleStopSimulation = () => {
    stopSimRef.current = true;
    setIsSimulatingScenario(false);
  };

  const handleRunSimulation = async () => {
    const targetProfilesToRun =
      compareModels && targetProfiles.length > 0
        ? targetProfiles
        : activeProfile
        ? [activeProfile]
        : [];

    if (targetProfilesToRun.length === 0) {
      await useDialogStore.getState().showAlert(
        compareModels
          ? 'Please select at least one connection profile to compare in Crucible.'
          : 'Please configure a connection profile in Settings before running simulated scenarios.',
        'Missing Configuration',
        'warning'
      );
      return;
    }

    if (!activeCard || !activeCard.data) return;

    stopSimRef.current = false;
    setIsSimulatingScenario(true);
    setCurrentSimTurn(0);

    const cardObj = activeCard as unknown as { uuid?: string; avatarUrl?: string; avatar?: string };
    const primary: SceneCharacter = {
      uuid: cardObj.uuid || activeCardUuid || activeCardRecord?.uuid || 'primary',
      name: activeCard.data.name || 'Character',
      avatar: cardObj.avatarUrl || cardObj.avatar || activeCard.data.avatar,
      data: activeCard.data,
    };

    const members = groupMemberUuids
      .map((uuid) => cards.find((c) => c.uuid === uuid))
      .filter((c): c is StoredCard => !!c)
      .map((c) => ({
        uuid: c.uuid,
        name: c.cardData.data.name || c.name || 'Character',
        avatar: c.cardData.data.avatar,
        data: c.cardData.data,
      }));
    const sceneCharacters: SceneCharacter[] = [primary, ...members];

    const initialHistory = buildInitialGreetingMessages(sceneCharacters, 'User', 0);
    setSimulatedTranscript(initialHistory);

    const runResult: Record<
      string,
      {
        transcript: { role: 'user' | 'assistant'; text: string; speakerUuid?: string; speakerName?: string }[];
        timestamp: number;
        error?: string;
      }
    > = {};

    await Promise.all(
      targetProfilesToRun.map(async (runProfile) => {
        let history = [...initialHistory];
        let runError: string | undefined;

        const personaGenerator = async (historySoFar: ChatMessage[]): Promise<string> => {
          const userMessageCount = historySoFar.filter((m) => m.role === 'user').length;
          const currentTurn = userMessageCount + 1;
          const scriptEntry = (scriptedTemplate.script || []).find((s) => s.turnIndex === currentTurn);
          if (scriptEntry) {
            return scriptEntry.injectedMessage;
          }
          return '*waits for you to continue*';
        };

        for (let turn = 1; turn <= scenarioTurnCount; turn++) {
          if (stopSimRef.current) break;

          setCurrentSimTurn((prev) => Math.max(prev, turn));

          try {
            history = await executeConversationTurn({
              profile: runProfile,
              sceneCharacters,
              history,
              userTurnInput: personaGenerator,
              userName: 'User',
              onSpeakerTyping: (spk) => {
                if (runProfile.uuid === targetProfilesToRun[0].uuid) setSimSpeakerTyping(spk);
              },
              onStepMessage: (_msg, updated) => {
                if (runProfile.uuid === targetProfilesToRun[0].uuid) setSimulatedTranscript(updated);
              },
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`Error in simulated turn for profile ${runProfile.name}:`, err);
            history.push({ role: 'assistant', text: `[Simulation error on turn ${turn}: ${errMsg}]` });
            runError = `Turn ${turn}: ${errMsg}`;
            break;
          }
        }

        runResult[runProfile.uuid] = {
          transcript: history.map((m) => ({
            role: m.role,
            text: m.text,
            speakerUuid: m.speakerUuid,
            speakerName: m.speakerName,
          })),
          timestamp: Date.now(),
          ...(runError ? { error: runError } : {}),
        };
      })
    );

    setIsSimulatingScenario(false);
    setSimSpeakerTyping(null);

    const newScenario = {
      id: crypto.randomUUID(),
      name: `Scenario ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      persona: selectedPersona,
      turnCount: scenarioTurnCount,
      script: scriptedTemplate.script,
      lastRunResult: runResult,
    };

    const currentScenarios = (activeCardRecord?.scenarios as unknown[]) || [];
    updateActiveCardScenarios([newScenario, ...currentScenarios] as unknown as CrucibleScenario[]);
  };

  return {
    scenarioTurnCount,
    setScenarioTurnCount,
    isSimulatingScenario,
    currentSimTurn,
    simulatedTranscript,
    simSpeakerTyping,
    groupMemberUuids,
    toggleGroupMember,
    scriptedTemplate,
    handleAddScriptEntry,
    handleRemoveScriptEntry,
    handleRunSimulation,
    handleStopSimulation,
  };
}
