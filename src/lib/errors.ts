/**
 * Base error class for MCP tool errors
 * Provides structured error information for AI consumption
 */
export class McpToolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

/**
 * Error for upstream API failures
 */
export class UpstreamApiError extends McpToolError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly upstream: string,
    details?: Record<string, unknown>,
  ) {
    super(message, 'UPSTREAM_API_ERROR', { statusCode, upstream, ...details });
    this.name = 'UpstreamApiError';
  }
}

/**
 * Error for resource not found
 */
export class NotFoundError extends McpToolError {
  constructor(resourceType: string, identifier: string) {
    super(`${resourceType} not found: ${identifier}`, 'NOT_FOUND', { resourceType, identifier });
    this.name = 'NotFoundError';
  }
}

/**
 * Error for validation failures
 */
export class ValidationError extends McpToolError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', { field });
    this.name = 'ValidationError';
  }
}

/**
 * Error for authentication failures
 */
export class AuthenticationError extends McpToolError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR', {});
    this.name = 'AuthenticationError';
  }
}

/**
 * Error for missing configuration (credentials, env vars, etc.)
 * Use this instead of returning dummy/mock data when config is missing.
 */
export class ConfigurationError extends McpToolError {
  constructor(message: string, missingConfig?: string) {
    super(message, 'CONFIGURATION_ERROR', { missingConfig });
    this.name = 'ConfigurationError';
  }
}
