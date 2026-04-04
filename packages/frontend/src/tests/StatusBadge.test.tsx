import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/StatusBadge';
import { CampaignStatus } from '@/types/campaign';

const STATUSES: Array<{ status: CampaignStatus; label: string; colorPart: string }> = [
  { status: 'draft',     label: 'Draft',     colorPart: 'gray'   },
  { status: 'scheduled', label: 'Scheduled', colorPart: 'blue'   },
  { status: 'sending',   label: 'Sending',   colorPart: 'yellow' },
  { status: 'sent',      label: 'Sent',      colorPart: 'green'  },
];

describe('StatusBadge', () => {
  STATUSES.forEach(({ status, label, colorPart }) => {
    it(`renders "${label}" for status "${status}"`, () => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it(`applies ${colorPart} CSS classes for status "${status}"`, () => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByText(label);
      expect(badge.className).toMatch(new RegExp(colorPart));
    });
  });

  it('renders as an inline element (span)', () => {
    render(<StatusBadge status="draft" />);
    const badge = screen.getByText('Draft');
    expect(badge.tagName.toLowerCase()).toBe('span');
  });
});
