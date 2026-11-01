// @vitest-environment jsdom
import '../test/setup';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ExportVerifyModal,
  type VerifyReport,
} from '../src/components/editor/ExportVerifyModal';
import { createNewDefaultCard } from '../src/utils/cardDefaults';

const noop = vi.fn();

function baseProps() {
  return {
    cardData: createNewDefaultCard('Verify test').data,
    setIsPreviewModalOpen: noop,
    handleExport: noop,
    diffSnapshot: null,
    setDiffSnapshot: noop,
    restoreSnapshot: noop,
    showConfirmDialog: noop,
    setVerifyReport: noop,
  };
}

function report(overrides: Partial<VerifyReport>): VerifyReport {
  return {
    fileName: 'test.json',
    format: 'json',
    verified: true,
    matchedCount: 1,
    mismatchCount: 0,
    diffs: [
      {
        key: 'name',
        label: 'Name',
        category: 'text',
        liveValue: 'Aria',
        exportedValue: 'Aria',
        isMatch: true,
      },
    ],
    ...overrides,
  };
}

describe('ExportVerifyModal honest copy', () => {
  it('a passed check uses the new banner and footer and no banned phrase', () => {
    const { container } = render(
      <ExportVerifyModal
        {...baseProps()}
        isPreviewModalOpen={false}
        previewDataUrl={null}
        verifyReport={report({})}
      />,
    );
    expect(
      screen.getByText(
        'Round-trip check passed. This app read the exported file back and every compared field matches the live card.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This check only shows that this app can read its own export back. It does not test other apps, including SillyTavern.',
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/zero data loss|100%|safely|verified intact/i);
  });

  it('the poster preview footer says Visual PNG, not Spec Compliant', () => {
    const { container } = render(
      <ExportVerifyModal
        {...baseProps()}
        isPreviewModalOpen
        previewDataUrl="data:image/png;base64,AAAA"
        verifyReport={null}
      />,
    );
    expect(screen.getByText('Visual PNG:')).toBeInTheDocument();
    expect(screen.getByText('the card data is embedded in the image file.')).toBeInTheDocument();
    expect(container.textContent).not.toContain('Spec Compliant');
  });

  it('a failed check still shows Verification Discrepancies Found', () => {
    render(
      <ExportVerifyModal
        {...baseProps()}
        isPreviewModalOpen={false}
        previewDataUrl={null}
        verifyReport={report({
          verified: false,
          matchedCount: 0,
          mismatchCount: 1,
          diffs: [
            {
              key: 'name',
              label: 'Name',
              category: 'text',
              liveValue: 'Aria',
              exportedValue: 'Bob',
              isMatch: false,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/Verification Discrepancies Found/)).toBeInTheDocument();
  });
});
