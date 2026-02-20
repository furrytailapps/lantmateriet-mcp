import { AuthenticationError, UpstreamApiError } from './errors';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

const LANTMATERIET_TOKEN_URL = 'https://api.lantmateriet.se/token';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

function getCredentials(): { consumerKey: string; consumerSecret: string } {
  const consumerKey = process.env.LANTMATERIET_CONSUMER_KEY;
  const consumerSecret = process.env.LANTMATERIET_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new AuthenticationError(
      'LANTMATERIET_CONSUMER_KEY and LANTMATERIET_CONSUMER_SECRET environment variables are required',
    );
  }

  return { consumerKey, consumerSecret };
}

function isTokenValid(): boolean {
  if (!cachedToken) return false;
  return Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS;
}

async function fetchNewToken(): Promise<CachedToken> {
  const { consumerKey, consumerSecret } = getCredentials();

  const response = await fetch(LANTMATERIET_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: consumerKey,
      client_secret: consumerSecret,
    }),
  });

  if (!response.ok) {
    throw new UpstreamApiError(
      'Authentication with the data service failed. This may be a temporary issue — try again.',
      response.status,
      'Lantmäteriet OAuth2',
    );
  }

  const data = (await response.json()) as TokenResponse;

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// Returns cached token if still valid, otherwise fetches new one
export async function getAccessToken(): Promise<string> {
  if (isTokenValid() && cachedToken) {
    return cachedToken.accessToken;
  }

  cachedToken = await fetchNewToken();
  return cachedToken.accessToken;
}

export function clearTokenCache(): void {
  cachedToken = null;
}

export function hasCredentials(): boolean {
  return !!(process.env.LANTMATERIET_CONSUMER_KEY && process.env.LANTMATERIET_CONSUMER_SECRET);
}
