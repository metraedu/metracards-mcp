export type HealthResponse = {
  status: string;
  timestamp: string;
  service: string;
};

export class MetraCardsApiError extends Error {
  readonly statusCode?: number;
  readonly body?: string;

  constructor(
    message: string,
    options?: { statusCode?: number; body?: string },
  ) {
    super(message);
    this.name = 'MetraCardsApiError';
    this.statusCode = options?.statusCode;
    this.body = options?.body;
  }
}

export class MetraCardsApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getHealth(): Promise<HealthResponse> {
    const url = `${this.baseUrl}/health`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MetraCardsApiError(
        `Failed to reach MetraCards API at ${url}: ${message}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new MetraCardsApiError(
        `MetraCards API health returned HTTP ${response.status}`,
        { statusCode: response.status, body: text.slice(0, 500) },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new MetraCardsApiError(
        'MetraCards API health returned invalid JSON',
        {
          statusCode: response.status,
          body: text.slice(0, 500),
        },
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as HealthResponse).status !== 'string' ||
      typeof (parsed as HealthResponse).timestamp !== 'string' ||
      typeof (parsed as HealthResponse).service !== 'string'
    ) {
      throw new MetraCardsApiError(
        'MetraCards API health payload missing required fields',
        {
          statusCode: response.status,
          body: text.slice(0, 500),
        },
      );
    }

    return parsed as HealthResponse;
  }
}
