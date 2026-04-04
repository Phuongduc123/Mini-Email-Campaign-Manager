import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useSendCampaign } from '@/hooks/useSendCampaign';
import { campaignsApi } from '@/api/campaigns.api';
import type { Campaign } from '@/types/campaign';

vi.mock('@/api/campaigns.api', () => ({
  campaignsApi: { send: vi.fn() },
}));

const mockSend = vi.mocked(campaignsApi.send);

const CAMPAIGN_ID = 7;

const mockCampaign: Campaign = {
  id: CAMPAIGN_ID,
  name: 'Test Campaign',
  subject: 'Hello',
  body: 'World',
  status: 'sending',
  scheduledAt: null,
  createdBy: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
}

// ── onSuccess cache management ─────────────────────────────────────────────────

describe('useSendCampaign', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    mockSend.mockReset();
  });

  it('sets the campaign detail in the query cache after a successful send', async () => {
    mockSend.mockResolvedValue(mockCampaign);

    const { result } = renderHook(() => useSendCampaign(CAMPAIGN_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    const cached = queryClient.getQueryData<Campaign>(['campaign', CAMPAIGN_ID]);
    expect(cached).toEqual(mockCampaign);
  });

  it('invalidates the campaigns list query on success', async () => {
    mockSend.mockResolvedValue(mockCampaign);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSendCampaign(CAMPAIGN_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['campaigns'] }),
    );
  });

  it('invalidates the campaign-stats query on success', async () => {
    mockSend.mockResolvedValue(mockCampaign);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSendCampaign(CAMPAIGN_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['campaign-stats', CAMPAIGN_ID] }),
    );
  });

  it('calls campaignsApi.send with the correct campaign id', async () => {
    mockSend.mockResolvedValue(mockCampaign);

    const { result } = renderHook(() => useSendCampaign(CAMPAIGN_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    expect(mockSend).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it('does not update cache when the API call fails', async () => {
    mockSend.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useSendCampaign(CAMPAIGN_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    const cached = queryClient.getQueryData(['campaign', CAMPAIGN_ID]);
    expect(cached).toBeUndefined();
  });
});
