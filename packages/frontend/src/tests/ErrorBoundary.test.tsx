import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Suppress React's error boundary console.error output during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// A component that throws on demand
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Kaboom from Bomb component');
  return <p>All good</p>;
}

// A component that throws a non-Error value
function NonErrorThrower(): never {
  throw 'just a string error';
}

// ── Normal rendering ───────────────────────────────────────────────────────────

describe('ErrorBoundary — normal rendering', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Safe content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('does not show the error UI when children render successfully', () => {
    render(
      <ErrorBoundary>
        <p>OK</p>
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });
});

// ── Error catching ─────────────────────────────────────────────────────────────

describe('ErrorBoundary — catching errors', () => {
  it('shows "Something went wrong" heading when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('displays the error message from the thrown Error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Kaboom from Bomb component')).toBeInTheDocument();
  });

  it('shows a generic message when a non-Error value is thrown', () => {
    render(
      <ErrorBoundary>
        <NonErrorThrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
  });

  it('renders the custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<p>Custom fallback UI</p>}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback UI')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });
});

// ── Recovery ───────────────────────────────────────────────────────────────────

describe('ErrorBoundary — recovery', () => {
  it('shows a "Try again" button in the default error UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('resets the error state and re-renders children when "Try again" is clicked', async () => {
    // 1. Render with a throwing child — boundary enters error state
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // 2. Swap out the throwing child BEFORE clicking Try again, so the reset
    //    renders a healthy child instead of immediately re-throwing
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    // Error UI still visible (boundary hasn't reset yet)
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // 3. Click "Try again" — boundary clears hasError → renders the healthy child
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });
});
