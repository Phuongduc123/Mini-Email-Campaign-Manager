import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useCampaigns } from '@/hooks/useCampaigns';
import { StatusBadge } from '@/components/StatusBadge';
import { CampaignListSkeleton } from '@/components/LoadingSkeleton';
import { ErrorMessage } from '@/components/ErrorMessage';
import { AppLayout } from '@/components/AppLayout';
import { ApiError } from '@/types/api';

export default function CampaignsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page   = Number(searchParams.get('page')   ?? '1');
  const search = searchParams.get('search') ?? '';

  // Local input value — debounced before hitting the API
  const [inputValue, setInputValue] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPage = (p: number) =>
    setSearchParams({ page: String(p), ...(search ? { search } : {}) }, { replace: true });

  const handleSearchChange = (value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Reset to page 1 when search changes
      setSearchParams(
        value ? { search: value, page: '1' } : { page: '1' },
        { replace: true },
      );
    }, 400);
  };

  // Keep local input in sync if URL changes externally (e.g. browser back)
  useEffect(() => {
    setInputValue(search);
  }, [search]);

  const { data, isLoading, isError, error } = useCampaigns({
    page,
    limit: 20,
    search: search || undefined,
  });

  return (
    <AppLayout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Campaigns</h2>
          {data && (
            <p className="text-sm text-slate-500 mt-0.5">
              {search
                ? `${data.meta.total} result${data.meta.total !== 1 ? 's' : ''} for "${search}"`
                : `${data.meta.total} total`}
            </p>
          )}
        </div>
        <Link
          to="/campaigns/new"
          className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Campaign
        </Link>
      </div>

      {/* Search */}
      <div className="mb-5 relative max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name or subject…"
          className="w-full border border-slate-200 rounded-lg pl-9 pr-8 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
        />
        {inputValue && (
          <button
            onClick={() => handleSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <CampaignListSkeleton />
      ) : isError ? (
        <ErrorMessage error={error as AxiosError<ApiError>} />
      ) : !data?.data.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
            </svg>
          </div>
          {search ? (
            <>
              <h3 className="text-base font-semibold text-slate-900 mb-1">No results found</h3>
              <p className="text-sm text-slate-500 mb-4">
                No campaigns match "<span className="font-medium">{search}</span>"
              </p>
              <button
                onClick={() => handleSearchChange('')}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-slate-900 mb-1">No campaigns yet</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-xs">
                Create your first campaign and start reaching your audience.
              </p>
              <Link
                to="/campaigns/new"
                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Campaign
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((campaign) => (
              <Link
                key={campaign.id}
                to={`/campaigns/${campaign.id}`}
                className="group flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-4 hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Status color dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    campaign.status === 'sent'      ? 'bg-emerald-500' :
                    campaign.status === 'sending'   ? 'bg-amber-400 animate-pulse' :
                    campaign.status === 'scheduled' ? 'bg-blue-500' :
                    'bg-slate-300'
                  }`} />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate group-hover:text-indigo-700 transition-colors">
                        {campaign.name}
                      </span>
                      <StatusBadge status={campaign.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(campaign.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-8">
              <p className="text-sm text-slate-500">
                Page <span className="font-medium text-slate-700">{data.meta.page}</span> of {data.meta.totalPages}
                <span className="ml-1 text-slate-400">({data.meta.total} campaigns)</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= data.meta.totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
