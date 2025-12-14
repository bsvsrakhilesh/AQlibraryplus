import axios from 'axios';
import { log, mask } from '../utils/logger';

const GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';

export async function googleSearch(q: string, page: number = 1) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_CX;

  if (!key || !cx) {
    const msg = 'Missing GOOGLE_CSE_KEY or GOOGLE_CSE_CX in environment';
    log.error('cse.env.missing', { msg });
    throw new Error(msg);
  }

  // Google CSE supports start index up to ~91 for 10-per-page (max 100 results)
  const safePage = Number.isFinite(page) ? Math.max(1, Math.min(10, page)) : 1;
  const start = (safePage - 1) * 10 + 1;

  const startedAt = Date.now();
  try {
    const resp = await axios.get(GOOGLE_CSE_URL, {
      params: {
        q,
        key,
        cx,
        num: 10,
        start,               // <-- pagination
        safe: 'off',
        prettyPrint: false,
      },
      validateStatus: (s) => s >= 200 && s < 300,
    });

    const items: any[] = Array.isArray(resp?.data?.items) ? resp.data.items : [];
    const results = items.map((item: any) => ({
      title:   item?.title ?? '',
      url:     item?.link ?? '',
      snippet: item?.snippet ?? '',
    }));

    const nextStart: unknown = resp?.data?.queries?.nextPage?.[0]?.startIndex;
    const nextPage =
      typeof nextStart === 'number' ? Math.floor((nextStart - 1) / 10) + 1 : null;

    const totalRaw: unknown = resp?.data?.searchInformation?.totalResults;
    const totalResults =
      typeof totalRaw === 'string'
        ? Number(totalRaw)
        : typeof totalRaw === 'number'
        ? totalRaw
        : null;

    log.info('cse.search.ok', {
      query: q,
      cx: mask(cx),
      page: safePage,
      start,
      status: resp.status,
      items_count: results.length,
      nextPage,
      totalResults,
      ms: Date.now() - startedAt,
    });

    return { results, nextPage, totalResults };
  } catch (err: any) {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    const reason = data?.error?.message || err.message || 'CSE request failed';

    let hint = '';
    if (status === 403) hint = 'check key/cx validity and daily quota';
    else if (status === 400) hint = 'check your query or cx id';

    log.error('cse.search.fail', {
      query: q,
      cx: mask(cx),
      status,
      reason,
      hint,
      ms: Date.now() - startedAt,
    });

    throw new Error(`Google CSE error ${status ?? ''}: ${reason}${hint ? ` (${hint})` : ''}`);
  }
}