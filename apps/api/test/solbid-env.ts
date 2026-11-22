/** Imported first by solbid.e2e.ts: points COLLABIZ at a local fake SOLBID with a shared test secret. */
process.env.SOLBID_API_URL = 'http://127.0.0.1:45992';
process.env.SOLBID_SHARED_SECRET = 'test-solbid-shared-secret';
export {};
