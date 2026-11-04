// @vitest-environment jsdom
import '../test/setup';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaSection } from '../src/components/settings/PwaSection';
import { checkForAppUpdate, clearAppCache } from '../src/utils/pwaMaintenance';

vi.mock('../src/utils/pwaMaintenance', () => ({
  checkForAppUpdate: vi.fn(),
  clearAppCache: vi.fn(),
}));

const mockCheck = vi.mocked(checkForAppUpdate);
const mockClear = vi.mocked(clearAppCache);

const CONFIRM_TEXT =
  'This removes the offline copy of the app stored in this browser, then reloads the page. Your cards, lorebooks, connection profiles and settings are not changed. You need an internet connection to start the app again; it downloads a fresh copy.';
const OFFLINE_TEXT =
  'You are offline. Clearing the cache now would stop the app from starting. Connect to the internet first.';

function setOnLine(onLine: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: onLine, configurable: true });
}

function renderSection(isInstallable = true) {
  const reloadPage = vi.fn();
  render(
    <PwaSection
      isInstallable={isInstallable}
      isInstalled={false}
      promptInstall={async () => {}}
      reloadPage={reloadPage}
    />,
  );
  return { reloadPage };
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnLine(true);
});

afterEach(() => {
  setOnLine(true);
});

describe('PwaSection maintenance buttons', () => {
  it('shows the install button only when isInstallable', () => {
    const { unmount } = render(
      <PwaSection
        isInstallable={true}
        isInstalled={false}
        promptInstall={async () => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Install PersonaKiln' }),
    ).toBeInTheDocument();
    unmount();
    renderSection(false);
    expect(
      screen.queryByRole('button', { name: 'Install PersonaKiln' }),
    ).toBeNull();
  });

  it.each([
    ['current', 'You are on the latest version.'],
    [
      'found',
      'A new version was found. Tap Reload in the Update Available message to install it.',
    ],
    ['failed', 'Could not check for updates. Check your connection and try again.'],
    [
      'no-worker',
      'No offline app copy is installed in this browser yet. Reload the page once, then try again.',
    ],
    [
      'unsupported',
      'This browser does not support offline app copies, so there is nothing to update.',
    ],
  ] as const)('shows the exact text for a %s check result', async (result, text) => {
    mockCheck.mockResolvedValue(result);
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check for updates' }),
    ).toBeEnabled();
  });

  it('disables the check button and reads Checking... while a check runs', async () => {
    let resolveCheck!: (value: 'current') => void;
    mockCheck.mockReturnValue(
      new Promise<'current'>((resolve) => {
        resolveCheck = resolve;
      }),
    );
    renderSection();
    const button = screen.getByRole('button', { name: 'Check for updates' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Checking...');
    resolveCheck('current');
    await screen.findByText('You are on the latest version.');
  });

  it('first tap on Clear app cache shows the confirm text and calls nothing', () => {
    const { reloadPage } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Clear app cache' }));
    expect(screen.getByText(CONFIRM_TEXT)).toBeInTheDocument();
    expect(mockClear).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('Cancel closes the confirm block', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Clear app cache' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(CONFIRM_TEXT)).toBeNull();
  });

  it('Clear and reload calls clearAppCache once and then reloadPage once, in that order', async () => {
    const { reloadPage } = renderSection();
    mockClear.mockResolvedValue({ workersRemoved: 1, cachesDeleted: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Clear app cache' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear and reload' }));
    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockClear.mock.invocationCallOrder[0]).toBeLessThan(
      reloadPage.mock.invocationCallOrder[0],
    );
  });

  it('shows the offline text with no confirm block and no calls when offline', () => {
    const { reloadPage } = renderSection();
    setOnLine(false);
    fireEvent.click(screen.getByRole('button', { name: 'Clear app cache' }));
    expect(screen.getByText(OFFLINE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(CONFIRM_TEXT)).toBeNull();
    expect(mockClear).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('a rejecting clearAppCache shows the error text and does not reload', async () => {
    const { reloadPage } = renderSection();
    mockClear.mockRejectedValue(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear app cache' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear and reload' }));
    expect(
      await screen.findByText('Could not clear the app cache: boom.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONFIRM_TEXT)).toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();
  });
});
