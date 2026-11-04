import React, { useState } from 'react';
import { useCardStore } from '../store/useCardStore';
import type { CharacterCardV3 } from '../schemas/cardSchema';
import {
  GraduationCap,
  Sparkles,
  Download,
  FlaskConical,
  Copy,
  Check,
  ShieldAlert,
  Zap,
  Code,
  FileCode2,
  CheckCircle2,
  Layers,
  ArrowRight,
  X,
  Coins,
  ShieldCheck,
  Lock,
  HelpCircle,
  BarChart3,
} from 'lucide-react';

// Sample Cards Data
const SAMPLE_CARDS: { title: string; subtitle: string; tag: string; card: CharacterCardV3 }[] = [
  {
    title: 'Aeliana Vane',
    subtitle: 'Starlight Astronomer & Runesmith',
    tag: 'Fantasy RPG',
    card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Aeliana Vane',
        description: 'Aeliana is a high elven runesmith who observes astral alignments to forge star-infused weapons. She has shimmering silver-white hair tied in a loose braid, deep violet eyes that glow faint indigo when she casts spells, and wears lightweight blue obsidian robes lined with silver runes.',
        personality: 'Analytical, quietly compassionate, focused on celestial mechanics, protective of ancient lore.',
        scenario: 'Aeliana is inspecting an ancient celestial observatory at midnight when {{user}} stumbles upon her forge.',
        first_mes: '*Aeliana pauses her silver hammer mid-air as celestial spark embers drift around her anvil. She turns her glowing violet eyes toward you, adjusting her runic leather gloves.* "A visitor at midnight? Be cautious where you step—these star-charts are aligned with active ley lines."',
        alternate_greetings: [
          '*Sitting at a grand telescope, Aeliana marks a celestial parchment with a quill.* "If you are looking for star-steel weapons, you will need patience. The stars must align first."',
        ],
        system_prompt: 'Adhere closely to high fantasy dialogue. Speak with poise and detailed sensory descriptions.',
        post_history_instructions: 'Keep responses immersive, descriptive, and limited to 2-3 paragraphs per turn.',
        character_version: '1.0',
        mes_example: '',
        creator_notes: '',
        extensions: {},
        group_only_greetings: [],
        tags: ['fantasy', 'elf', 'mage', 'runesmith'],
        creator: 'PersonaKiln Studio',
        creation_date: Math.floor(Date.now() / 1000),
        modification_date: Math.floor(Date.now() / 1000),
        character_book: {
          name: 'Aeliana Lorebook',
          scan_depth: 5,
          token_budget: 1000,
          recursive_scanning: true,
          extensions: {},
          entries: [
            {
              keys: ['star-steel', 'runes', 'weapons'],
              content: '@@depth 3\nStar-steel is forged under starlight using astral runes. It never dulls and radiates faint moonlight.',
              enabled: true,
              insertion_order: 10,
              use_regex: false,
              extensions: {},
            },
            {
              keys: ['observatory', 'astronomy'],
              content: '@@depth 4\nThe Observatory of Aethelgard sits atop the Silver Crags, housing the grand celestial lens.',
              enabled: true,
              insertion_order: 20,
              use_regex: false,
              extensions: {},
            },
          ],
        },
      },
    },
  },
  {
    title: 'Garrick Ironwill',
    subtitle: 'Dwarf Blacksmith & Tactical Leader',
    tag: 'D&D Tactician',
    card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Garrick Ironwill',
        description: 'Garrick is a veteran mountain dwarf commander with a braided copper beard, scarred knuckles, and custom mithril full-plate armor. He leads battle tactical planning for the Northern Keep.',
        personality: 'Gruff, fiercely loyal, pragmatic, fond of strong ale and solid steel.',
        scenario: 'Garrick is reviewing battlemaps over a mug of spiced ale when {{user}} enters his war room.',
        first_mes: '*Garrick slams a heavy gauntleted fist onto the oak war map, scattering wooden markers across the table.* "Ah, {{user}}! Good timing. The goblins are massing near the Eastern Ridge. Grab a chair and help me pick our ambush point."',
        alternate_greetings: [],
        system_prompt: 'Use gruff, confident dwarven speech patterns.',
        post_history_instructions: '',
        character_version: '1.0',
        mes_example: '',
        creator_notes: '',
        extensions: {},
        group_only_greetings: [],
        tags: ['dwarf', 'warrior', 'tactician', 'rpg'],
        creator: 'PersonaKiln Studio',
        creation_date: Math.floor(Date.now() / 1000),
        modification_date: Math.floor(Date.now() / 1000),
        character_book: {
          name: 'Northern Keep Lore',
          extensions: {},
          entries: [
            {
              keys: ['eastern ridge', 'goblins'],
              content: '@@depth 3\nThe Eastern Ridge is a narrow mountain pass ideal for defensive chokepoints.',
              enabled: true,
              insertion_order: 10,
              use_regex: false,
              extensions: {},
            },
          ],
        },
      },
    },
  },
  {
    title: 'Vex-09',
    subtitle: 'Cyberpunk Rogue Netrunner',
    tag: 'Sci-Fi Cyberpunk',
    card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Vex-09',
        description: 'Vex-09 is a freelance netrunner with holographic neon arm tattoos, cybernetic optic implants, and a custom stealth deck loaded with illegal subroutines.',
        personality: 'Sarcastic, sharp-witted, hyper-resourceful, distrustful of megacorps.',
        scenario: 'Vex is jacked into an underground data terminal in Neon Alley when {{user}} arrives with a hot datadrive.',
        first_mes: '*Vex flickers her optic visor, holographic data streams reflecting in her eyes.* "Keep your head down, {{user}}. The Arasaka IC scanners just swept the block. Show me what you fetched on that drive before they trace us."',
        alternate_greetings: [],
        system_prompt: 'Use cyberpunk slang (jacked in, ICE, netrunner, subroutines).',
        post_history_instructions: 'Include bracketed optic status readouts occasionally.',
        character_version: '1.0',
        mes_example: '',
        creator_notes: '',
        extensions: {},
        group_only_greetings: [],
        tags: ['cyberpunk', 'netrunner', 'sci-fi', 'hacker'],
        creator: 'PersonaKiln Studio',
        creation_date: Math.floor(Date.now() / 1000),
        modification_date: Math.floor(Date.now() / 1000),
      },
    },
  },
];

export const GuideView: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { importCardRecord, setActiveTab, selectCardForEditing, setIsOnboardingOpen } = useCardStore();
  const [copiedMacro, setCopiedMacro] = useState<string | null>(null);
  const [importedSampleTitle, setImportedSampleTitle] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'quickstart' | 'crucible' | 'features' | 'spec' | 'macros' | 'responsible'>('quickstart');

  const handleClose = () => {
    setIsOnboardingOpen(false);
    if (onClose) onClose();
  };

  const handleImportSample = async (sample: typeof SAMPLE_CARDS[0]) => {
    const uuid = await importCardRecord(sample.card);
    setImportedSampleTitle(sample.title);
    setTimeout(() => setImportedSampleTitle(null), 3000);
    await selectCardForEditing(uuid);
    setActiveTab('editor');
    setIsOnboardingOpen(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMacro(text);
    setTimeout(() => setCopiedMacro(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8 pb-24 max-h-[calc(100dvh-1.5rem)] md:max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-30 -mt-4 md:-mt-6 h-0 flex justify-end">
        <button
          onClick={handleClose}
          aria-label="Close Guide"
          title="Close Onboarding Guide"
          className="min-w-11 min-h-11 flex items-center justify-center bg-void-800 hover:bg-knight-700 text-knight-200 rounded-xl transition-colors border border-knight-700 shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-maroon-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Hero Header */}
      <div className="bg-void-900 border border-knight-700/40 p-5 sm:p-6 md:p-8 rounded-3xl shadow-sm text-center md:text-left relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-maroon-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex max-w-full items-center justify-center gap-2 px-3 py-2 bg-maroon-950/80 border border-maroon-800/80 rounded-full text-maroon-300 text-xs font-medium">
            <GraduationCap className="w-4 h-4 text-maroon-400" />
            <span>PersonaKiln Field Guide & Reference</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-mist-100">
            Master Character Card Creation & Testing
          </h1>
          <p className="text-xs md:text-sm text-knight-400 max-w-2xl leading-relaxed">
            A complete guide to authoring, testing, and exporting spec-compliant Character Card V3 (CCv3) and V2 cards with lorebooks, AI field assistance, Crucible resilience testing, and encrypted backups.
          </p>

          {/* Guide Sub-Nav Tabs */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { id: 'quickstart', label: 'Quickstart & Samples', icon: Layers },
              { id: 'crucible', label: 'Crucible Resilience Testing', icon: FlaskConical },
              { id: 'features', label: 'AI Tools & Productivity Features', icon: Sparkles },
              { id: 'spec', label: 'CCv3 Spec Reference', icon: FileCode2 },
              { id: 'macros', label: 'Macro Reference', icon: Code },
              { id: 'responsible', label: 'Responsible Use', icon: ShieldAlert },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as 'quickstart' | 'crucible' | 'features' | 'spec' | 'macros' | 'responsible')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                    isActive
                      ? 'bg-maroon-900/80 text-maroon-200 border-maroon-700 shadow-sm'
                      : 'bg-void-950/60 text-knight-400 border-knight-800 hover:text-mist-100 hover:bg-void-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 1: Quickstart Pipeline & 1-Click Samples */}
      {activeSection === 'quickstart' && (
        <div className="space-y-6">
          {/* 4-Step Walkthrough */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Quickstart Creation Pipeline
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              <div
                onClick={() => setActiveTab('editor')}
                className="p-4 bg-void-950/60 border border-knight-700/40 hover:border-maroon-400/60 rounded-xl space-y-2 cursor-pointer transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-maroon-500/20 text-maroon-400 font-bold text-xs flex items-center justify-center border border-maroon-400/30">
                  1
                </div>
                <h3 className="text-xs font-semibold text-mist-100 group-hover:text-maroon-300 flex items-center justify-between">
                  Create & Edit
                  <ArrowRight className="w-3.5 h-3.5 text-knight-500 group-hover:text-maroon-400" />
                </h3>
                <p className="text-[11px] text-knight-400 leading-snug">
                  Define name, personality, scenario, first message, and cover avatar image.
                </p>
              </div>

              <div
                onClick={() => setActiveTab('lorebook')}
                className="p-4 bg-void-950/60 border border-knight-700/40 hover:border-maroon-400/60 rounded-xl space-y-2 cursor-pointer transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 font-bold text-xs flex items-center justify-center border border-purple-500/30">
                  2
                </div>
                <h3 className="text-xs font-semibold text-mist-100 group-hover:text-purple-300 flex items-center justify-between">
                  Add Lorebook
                  <ArrowRight className="w-3.5 h-3.5 text-knight-500 group-hover:text-purple-400" />
                </h3>
                <p className="text-[11px] text-knight-400 leading-snug">
                  Embed keyword-triggered world entries and depth decorators (e.g. @@depth 4).
                </p>
              </div>

              <div
                onClick={() => setActiveTab('crucible')}
                className="p-4 bg-void-950/60 border border-knight-700/40 hover:border-maroon-400/60 rounded-xl space-y-2 cursor-pointer transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 font-bold text-xs flex items-center justify-center border border-amber-500/30">
                  3
                </div>
                <h3 className="text-xs font-semibold text-mist-100 group-hover:text-amber-300 flex items-center justify-between">
                  Test in Crucible
                  <ArrowRight className="w-3.5 h-3.5 text-knight-500 group-hover:text-amber-400" />
                </h3>
                <p className="text-[11px] text-knight-400 leading-snug">
                  Calculate token budgets and run jailbreak probes to get your Trust Rating.
                </p>
              </div>

              <div
                onClick={() => setActiveTab('gallery')}
                className="p-4 bg-void-950/60 border border-knight-700/40 hover:border-maroon-400/60 rounded-xl space-y-2 cursor-pointer transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/30">
                  4
                </div>
                <h3 className="text-xs font-semibold text-mist-100 group-hover:text-emerald-300 flex items-center justify-between">
                  Export PNG / CHARX
                  <ArrowRight className="w-3.5 h-3.5 text-knight-500 group-hover:text-emerald-400" />
                </h3>
                <p className="text-[11px] text-knight-400 leading-snug">
                  Save PNG tEXt chunks or CHARX zip bundles compatible with SillyTavern.
                </p>
              </div>
            </div>
          </div>

          {/* 1-Click Sample Cards */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-knight-700/40 pb-3">
              <div>
                <h2 className="text-sm font-bold text-mist-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  1-Click Ready-to-Use Sample Characters
                </h2>
                <p className="text-xs text-knight-400">
                  Import fully structured CCv3 character cards with lorebooks, greetings, and prompts directly into your local gallery.
                </p>
              </div>
            </div>

            {importedSampleTitle && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Successfully imported "{importedSampleTitle}" into your gallery! Opening editor...
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SAMPLE_CARDS.map((sample, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-void-950/60 border border-knight-700/40 rounded-2xl flex flex-col justify-between gap-3 hover:border-knight-700 transition-all"
                >
                  <div className="space-y-1.5">
                    <span className="px-2 py-0.5 bg-maroon-950 text-maroon-300 border border-maroon-800 text-[10px] rounded font-medium">
                      {sample.tag}
                    </span>
                    <h3 className="text-sm font-semibold text-mist-100">{sample.title}</h3>
                    <p className="text-xs text-knight-400">{sample.subtitle}</p>
                    <p className="text-[11px] text-knight-500 line-clamp-3 leading-relaxed">
                      {sample.card.data.description}
                    </p>
                  </div>

                  <button
                    onClick={() => handleImportSample(sample)}
                    className="w-full py-2 px-3 bg-void-800 hover:bg-maroon-500 text-mist-100 hover:text-mist-100 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 border border-knight-700 hover:border-maroon-400"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Import to Gallery
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Crucible Testing & Resilience Probing */}
      {activeSection === 'crucible' && (
        <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-5 shadow-sm">
          <div className="border-b border-knight-700/40 pb-3">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Crucible Stress Testing & Resilience Probing
            </h2>
            <p className="text-xs text-knight-400 mt-1">
              Verify your character's resilience against jailbreaks, system prompt disclosure, OOC leaks, and persona drift.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-void-950/80 border border-knight-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>1. Scripted Probe Vectors</span>
              </div>
              <p className="text-xs text-knight-400 leading-relaxed">
                Crucible executes specialized test vectors (System Hijack, OOC Injection, Character Break, Token Inflation) against your card using your active connection profile. Custom test vectors are saved directly to the card record for repeatable regression testing.
              </p>
            </div>

            <div className="p-4 bg-void-950/80 border border-knight-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs">
                <Zap className="w-4 h-4" />
                <span>2. Heuristic Jailbreak & Drift Detection</span>
              </div>
              <p className="text-xs text-knight-400 leading-relaxed">
                Probe responses are automatically evaluated using pattern-matching heuristics that detect AI disclosure, OOC leaks, broken persona boundaries, and forbidden keywords without requiring an external judge model.
              </p>
            </div>

            <div className="p-4 bg-void-950/80 border border-knight-800 rounded-xl space-y-2 col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <BarChart3 className="w-4 h-4" />
                <span>3. Trust Badge & Shareable Reports</span>
              </div>
              <p className="text-xs text-knight-400 leading-relaxed">
                After running the probe suite, click <strong>"Copy Trust Report"</strong> to generate a formatted markdown summary with resilience scores, detected drift turns, and pass/fail details ready for card sharing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: AI Field Tools, Usage Tracking & Productivity Features */}
      {activeSection === 'features' && (
        <div className="space-y-6">
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Assistant & Character Enhancer
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              Use the <strong>Assistant</strong> and <strong>Enhancer</strong> views to brainstorm character concepts, flesh out lorebooks, or generate optimized prompt snippets. The AI outputs prose suggestions and rewritten text snippets that you can review and manually copy into your card fields.
            </p>
          </div>

          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Chub.ai Direct Card Import
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              In the <strong>Gallery View</strong>, click <strong>Import from Chub</strong> and paste any Chub character URL or character ID/path (e.g. <code className="text-amber-300 font-mono">username/cardname</code> or <code className="text-amber-300 font-mono">12345</code>). PersonaKiln directly fetches the card definition or avatar PNG from Chub.ai and imports it into your local gallery.
            </p>
          </div>

          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Export Round-Trip Verification
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              After exporting a card as PNG or CHARX, click the animated <strong>Verify Export</strong> button in the Editor header. PersonaKiln immediately re-imports the exported binary file and performs a deep field-by-field diff (checking text fields, tags, lorebooks, extensions, and asset payloads) against your live card to check the export matches.
            </p>
          </div>

          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Always-Visible Payload Panel
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              Toggle the <strong>Payload Side Panel</strong> next to the editor to inspect live token counts across compiled prompt sections (System Prompt, Description, Personality, Scenario, Lorebook, Post-History). Use the interactive sample-input field to test user message triggers and see which lorebook entries actually fire in real time.
            </p>
          </div>

          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Coins className="w-4 h-4" />
              Token Usage & Cost Tracking
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              In <strong>Settings</strong>, PersonaKiln maintains a live per-model session token ledger (input + output tokens) and estimates running API costs using industry standard rate tables. Click "Reset Counter" anytime to start a fresh tracking session.
            </p>
          </div>

          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Zero-Knowledge Passphrase & Key Privacy Architecture
            </h2>
            <div className="space-y-3 text-xs text-knight-400 leading-relaxed">
              <p>
                <strong>Mandatory Passphrase Encryption:</strong> Storing LLM API keys in IndexedDB strictly requires a Master Passphrase to prevent plaintext credential exposure on disk.
              </p>
              <p>
                <strong>AES-256-GCM & PBKDF2:</strong> Credentials are encrypted at rest with AES-256-GCM using PBKDF2 key derivation (600,000 iterations of SHA-256 and a 16-byte random salt).
              </p>
              <p>
                <strong>Volatile Memory & Instant Locking:</strong> Decrypted keys exist purely in volatile WebCrypto memory during active unlocked sessions and are wiped when locking or closing the browser.
              </p>
              <p>
                <strong>API Key Redaction on Backup Export:</strong> When exporting JSON or ZIP backups, API keys are automatically stripped by default to prevent accidental credential leaks.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: CCv2 vs CCv3 Spec Comparison */}
      {activeSection === 'spec' && (
        <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
            <FileCode2 className="w-4 h-4" />
            Character Card V2 vs Character Card V3 Specification
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-knight-700/40 text-knight-400">
                  <th className="py-2.5 px-3">Feature Field</th>
                  <th className="py-2.5 px-3">CCv2 (Legacy Standard)</th>
                  <th className="py-2.5 px-3 text-maroon-400 font-semibold">CCv3 (Modern PersonaKiln Standard)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-knight-300">
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-mist-100">Root Specification Identifier</td>
                  <td className="py-2.5 px-3 font-mono text-knight-400">spec: "chara_card_v2"</td>
                  <td className="py-2.5 px-3 font-mono text-maroon-300">spec: "chara_card_v3", spec_version: "3.0"</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-mist-100">PNG Encoding Chunks</td>
                  <td className="py-2.5 px-3">Base64 encoded tEXt chunk ("chara")</td>
                  <td className="py-2.5 px-3">Base64 encoded tEXt chunk ("ccv3") with backfilled "chara" V2 fallback</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-mist-100">Embedded Assets / Media</td>
                  <td className="py-2.5 px-3 text-knight-500">Not supported natively</td>
                  <td className="py-2.5 px-3 text-emerald-400">Supported: icons, backgrounds, expressions (CHARX zip)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-mist-100">System Instructions Override</td>
                  <td className="py-2.5 px-3 text-knight-500">Global setting only</td>
                  <td className="py-2.5 px-3 font-mono text-mist-100">data.system_prompt</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-mist-100">Post-History Instructions</td>
                  <td className="py-2.5 px-3 text-knight-500">Not in spec</td>
                  <td className="py-2.5 px-3 font-mono text-mist-100">data.post_history_instructions</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-mist-100">Depth Decorators in Lorebook</td>
                  <td className="py-2.5 px-3 text-knight-500">Separated metadata keys</td>
                  <td className="py-2.5 px-3 font-mono text-amber-300">Inline @@depth X, @@scan_depth N, @@weight W</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-mist-100">Lorebook Key Activation Rules</td>
                  <td className="py-2.5 px-3 text-knight-400">Basic key matching</td>
                  <td className="py-2.5 px-3 text-knight-300 font-mono text-[11px]">
                    Selective matching: secondary keys required only when <code className="text-amber-300">selective: true</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 5: CBS Macro Reference Sheet */}
      {activeSection === 'macros' && (
        <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
            <Code className="w-4 h-4" />
            CBS Macro Reference Sheet
          </h2>
          <p className="text-xs text-knight-400">
            PersonaKiln automatically parses these standardized prompt macros at runtime during chats and test runs:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            {[
              { macro: '{{char}}', desc: 'Replaced with character name' },
              { macro: '{{user}}', desc: 'Replaced with user persona name' },
              { macro: '<START>', desc: 'Delimits conversation example blocks' },
              { macro: '{{original}}', desc: 'Injected in system prompt overrides to keep default system instructions' },
              { macro: '{{input}}', desc: 'Refers to current user input prompt' },
              { macro: '{{lastMessage}}', desc: 'Refers to the last response text turn' },
            ].map((item, idx) => (
              <div
                key={idx}
                onClick={() => copyToClipboard(item.macro)}
                className="p-3 bg-void-950/60 border border-knight-700/40 hover:border-maroon-400/50 rounded-xl flex items-center justify-between cursor-pointer transition-all"
              >
                <div>
                  <span className="text-maroon-300 font-bold block mb-0.5">{item.macro}</span>
                  <span className="text-[11px] text-knight-400 font-sans">{item.desc}</span>
                </div>
                <button className="text-knight-500 hover:text-mist-100 p-1">
                  {copiedMacro === item.macro ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 6: Responsible Use */}
      {activeSection === 'responsible' && (
        <div className="space-y-6">
          {/* Subsection 1: Fiction & Wellbeing */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-3 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Fiction & Wellbeing
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              Character cards and Crucible test conversations are fictional creative-writing outputs, not real interpersonal relationships, therapy, or professional advice. If you or someone you know is experiencing distress or emotional crisis, please reach out to a trusted person or a licensed healthcare professional rather than relying on roleplay characters for support.
            </p>
          </div>

          {/* Subsection 2: Content Responsibility & Provider Terms */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-3 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Content Responsibility & Provider Terms
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              PersonaKiln sends API requests directly from your browser to your configured LLM provider (Google Gemini, OpenAI, Anthropic, OpenRouter, or Ollama). All generated content is subject to your selected provider's acceptable use policies and terms of service. You are responsible for understanding and adhering to those policies; policy violations risk your API credentials being flagged, rate-limited, or terminated by the provider.
            </p>
          </div>

          {/* Subsection 3: Responsible Use */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-3 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Responsible Use
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              Tag filters are plain labels from the card, not a content filter or age gate. You are responsible for following local law and your AI provider's terms.
            </p>
          </div>

          {/* Subsection 4: Third-Party Imports */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-3 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Third-Party Imports (Chub.ai etc.)
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              Cards imported from Chub.ai or other repositories are authored by third-party creators in the community. Please respect the original creator's attribution, licensing, and distribution terms before publishing, remixing, or sharing modified versions of their cards.
            </p>
          </div>

          {/* Subsection 5: Data & Recovery */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-3 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Data & Recovery
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              All character cards, lorebooks, and settings reside strictly inside this browser's local storage with zero cloud synchronization. If you set a Master Passphrase and lose it, your encrypted API keys cannot be recovered by anyone. We strongly advise regularly exporting backup PNGs, JSONs, or CHARX archives of any cards and lorebooks you care about.
            </p>
          </div>

          {/* Subsection 6: No Formal Security Audit */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6 space-y-3 shadow-sm">
            <h2 className="text-sm font-bold text-mist-100 uppercase tracking-wider text-maroon-400 flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              No Formal Security Audit
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              PersonaKiln is an independent open-source project and has not undergone a formal third-party security audit. Cryptographic routines use standard WebCrypto primitives (AES-256-GCM, PBKDF2 with 600,000 iterations), but users should scope their trust accordingly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

