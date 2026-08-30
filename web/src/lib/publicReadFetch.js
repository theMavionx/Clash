import axios from 'axios';
import { publicReadRequest, installAxiosPublicReads } from '../../../common/public-read-policy.mjs';

export function createPublicReadFetch(fetchImpl) {
  return async (input, init = {}) => {
    const request = await publicReadRequest(input, init);
    if (!request) return fetchImpl(input, init);
    // Proxy credentials never enter the client or this envelope. Private,
    // signed, keyed-provider and unknown requests retain their normal path.
    return fetchImpl('/api/futures/public-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'omit',
      signal: request.signal,
      body: JSON.stringify({ url: request.url, method: request.method, body: request.body }),
    });
  };
}

if (typeof window !== 'undefined' && import.meta.env.VITE_PUBLIC_READ_PROXY_ENABLED !== 'false') {
  window.fetch = createPublicReadFetch(window.fetch.bind(window));
  installAxiosPublicReads(axios, { fetch: window.fetch });
}
