import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmModal } from '@/components/ConfirmModal';

const baseProps = {
  open: true,
  title: 'Delete Item',
  description: 'Are you sure you want to delete this?',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

// ── Visibility ─────────────────────────────────────────────────────────────────

describe('ConfirmModal — visibility', () => {
  it('renders nothing when open is false', () => {
    render(<ConfirmModal {...baseProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog when open is true', () => {
    render(<ConfirmModal {...baseProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the title and description', () => {
    render(<ConfirmModal {...baseProps} />);
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this?')).toBeInTheDocument();
  });
});

// ── Callbacks ──────────────────────────────────────────────────────────────────

describe('ConfirmModal — callbacks', () => {
  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...baseProps} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...baseProps} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the backdrop is clicked', async () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...baseProps} onCancel={onCancel} />);

    // The backdrop has aria-hidden and no label; target it by its aria attribute
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(backdrop);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm when cancel is clicked', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...baseProps} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ── Custom labels ──────────────────────────────────────────────────────────────

describe('ConfirmModal — custom labels', () => {
  it('uses custom confirmLabel', () => {
    render(<ConfirmModal {...baseProps} confirmLabel="Send Now" />);
    expect(screen.getByRole('button', { name: 'Send Now' })).toBeInTheDocument();
  });

  it('uses custom cancelLabel', () => {
    render(<ConfirmModal {...baseProps} cancelLabel="Go Back" />);
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
  });

  it('falls back to "Confirm" / "Cancel" when labels are not provided', () => {
    render(<ConfirmModal {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

// ── Danger styling ─────────────────────────────────────────────────────────────

describe('ConfirmModal — danger prop', () => {
  it('applies red styling to the confirm button when danger=true', () => {
    render(<ConfirmModal {...baseProps} danger confirmLabel="Delete" />);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toMatch(/bg-red/);
  });

  it('applies blue styling to the confirm button when danger=false (default)', () => {
    render(<ConfirmModal {...baseProps} confirmLabel="Send" />);
    const btn = screen.getByRole('button', { name: 'Send' });
    expect(btn.className).toMatch(/bg-blue/);
  });
});
