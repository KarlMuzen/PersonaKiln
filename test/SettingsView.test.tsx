// @vitest-environment jsdom
import '../test/setup';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsView } from '../src/components/SettingsView';
import { useCardStore } from '../src/store/useCardStore';
import { useTokenTracker } from '../src/store/useTokenTracker';
import 'fake-indexeddb/auto';

describe('SettingsView and Sub-sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCardStore.setState({
      profiles: [
        {
          uuid: 'test-prof-1',
          name: 'Primary Gemini',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          apiKey: 'test-key',
          temperature: 0.7,
          maxTokens: 2048,
          isDefault: true,
        },
      ],
      activeProfileUuid: 'test-prof-1',
      isPassphraseSet: true,
      isUnlocked: true,
      isPasskeySupported: true,
      isPasskeyEnrolled: false,
    });

    useTokenTracker.setState({
      stats: {
        'test-prof-1': {
          profileUuid: 'test-prof-1',
          profileName: 'Primary Gemini',
          model: 'gemini-2.5-flash',
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        },
      },
      loaded: true,
    });
  });

  it('renders all 5 modular settings sections properly', () => {
    render(<SettingsView />);

    // 1. Security section
    expect(screen.getByText(/API key protection/i)).toBeDefined();
    expect(screen.getByText(/Master Passphrase Active/i)).toBeDefined();
    expect(screen.getByText(/Unlocked \(Active Memory Session\)/i)).toBeDefined();

    // 2. Connection profiles section
    expect(screen.getByText(/Configured Connection Profiles/i)).toBeDefined();
    expect(screen.getAllByText(/Primary Gemini/i).length).toBeGreaterThan(0);

    // 3. Cost tracker section
    expect(screen.getByText(/Running Cost Estimate/i)).toBeDefined();
    expect(screen.getByText(/1,500/i)).toBeDefined();

    // 4. PWA section
    expect(screen.getByText(/Progressive Web App \(PWA\) & Offline Access/i)).toBeDefined();

    // 5. Backup & restore section
    expect(screen.getByText(/IndexedDB Storage & Full Backup/i)).toBeDefined();
    expect(screen.getByText(/Export Backup \(JSON\)/i)).toBeDefined();
  });

  it('allows switching connection profile form tabs and viewing parameters', () => {
    render(<SettingsView />);

    // Switch to parameters tab
    const paramTab = screen.getByRole('button', { name: /2\. Generation Parameters/i });
    fireEvent.click(paramTab);
    expect(screen.getByText(/Max Output Tokens/i)).toBeDefined();

    // Switch to advanced tab
    const advTab = screen.getByRole('button', { name: /3\. Pricing/i });
    fireEvent.click(advTab);
    expect(screen.getByText(/Override Pricing/i)).toBeDefined();
  });
});
