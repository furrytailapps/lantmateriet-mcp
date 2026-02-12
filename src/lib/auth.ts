import { AuthenticationError, UpstreamApiError } from './errors';

/**
 * OAuth2 token response from Lantmäteriet
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Cached token with expiry
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Token cache - module level for singleton behavior
 */
let cachedToken: CachedToken | null = null;

/**
 * Lantmäteriet API URLs
 */
const LANTMATERIET_TOKEN_URL = 'https://api.lantmateriet.se/token';

/**
 * Buffer time before expiry to refresh token (5 minutes)
 */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Get environment credentials
 */
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

/**
 * Check if cached token is still valid
 */
function isTokenValid(): boolean {
  if (!cachedToken) return false;
  return Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Fetch new OAuth2 token from Lantmäteriet
 */
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

/**
 * Get valid OAuth2 access token
 * Returns cached token if still valid, otherwise fetches new one
 */
export async function getAccessToken(): Promise<string> {
  if (isTokenValid() && cachedToken) {
    return cachedToken.accessToken;
  }

  cachedToken = await fetchNewToken();
  return cachedToken.accessToken;
}

/**
 * Clear cached token (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

/**
 * Check if credentials are configured
 */
export function hasCredentials(): boolean {
  return !!(process.env.LANTMATERIET_CONSUMER_KEY && process.env.LANTMATERIET_CONSUMER_SECRET);
}
