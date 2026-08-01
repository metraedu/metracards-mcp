export type HealthResponse = {
  status: string;
  timestamp: string;
  service: string;
};

export type UpsertUserBody = {
  display_name: string | null;
  photo_url: string | null;
};

export type CreateDeckBody = {
  id?: string;
  name: string;
  description?: string | null;
  color?: string;
  daily_new_cards_limit?: number;
};

export type UpdateDeckBody = {
  name?: string;
  description?: string | null;
  color?: string;
  daily_new_cards_limit?: number;
};

export type TokenProviderLike = {
  getIdToken(): Promise<string>;
  clearCache(): void;
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
  private readonly tokenProvider?: TokenProviderLike;

  constructor(baseUrl: string, tokenProvider?: TokenProviderLike) {
    this.baseUrl = baseUrl;
    this.tokenProvider = tokenProvider;
  }

  async getHealth(): Promise<HealthResponse> {
    const response = await this.request('/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
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

  async upsertUser(body: UpsertUserBody): Promise<void> {
    const response = await this.request(
      '/users',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      { auth: true },
    );
    const text = await response.text();
    if (!response.ok) {
      throw new MetraCardsApiError(
        `MetraCards API upsert user returned HTTP ${response.status}`,
        { statusCode: response.status, body: text.slice(0, 500) },
      );
    }
  }

  async listDecks(since?: string): Promise<unknown> {
    const query =
      since !== undefined && since !== ''
        ? `?since=${encodeURIComponent(since)}`
        : '';
    const response = await this.request(
      `/decks${query}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      { auth: true },
    );
    return this.readJsonOrThrow(response, 'list decks');
  }

  async createDeck(body: CreateDeckBody): Promise<unknown> {
    const response = await this.request(
      '/decks',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      { auth: true },
    );
    return this.readJsonOrThrow(response, 'create deck');
  }

  async getDeck(id: string): Promise<unknown> {
    const response = await this.request(
      `/decks/${encodeURIComponent(id)}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      { auth: true },
    );
    return this.readJsonOrThrow(response, 'get deck');
  }

  async updateDeck(id: string, body: UpdateDeckBody): Promise<unknown> {
    const response = await this.request(
      `/decks/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      { auth: true },
    );
    return this.readJsonOrThrow(response, 'update deck');
  }

  async deleteDeck(id: string): Promise<unknown> {
    const response = await this.request(
      `/decks/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Accept: 'application/json' } },
      { auth: true },
    );
    return this.readJsonOrThrow(response, 'delete deck');
  }

  private async readJsonOrThrow(
    response: Response,
    label: string,
  ): Promise<unknown> {
    const text = await response.text();
    if (!response.ok) {
      throw new MetraCardsApiError(
        `MetraCards API ${label} returned HTTP ${response.status}`,
        { statusCode: response.status, body: text.slice(0, 500) },
      );
    }
    if (text.trim() === '') {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new MetraCardsApiError(
        `MetraCards API ${label} returned invalid JSON`,
        { statusCode: response.status, body: text.slice(0, 500) },
      );
    }
  }

  private async request(
    pathname: string,
    init: RequestInit,
    options: { auth?: boolean } = {},
  ): Promise<Response> {
    const url = `${this.baseUrl}${pathname}`;
    const headers = new Headers(init.headers);

    if (options.auth) {
      if (!this.tokenProvider) {
        throw new MetraCardsApiError(
          'Authenticated request requires a token provider',
        );
      }
      const idToken = await this.tokenProvider.getIdToken();
      headers.set('Authorization', `Bearer ${idToken}`);
    }

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MetraCardsApiError(
        `Failed to reach MetraCards API at ${url}: ${message}`,
      );
    }

    if (options.auth && response.status === 401 && this.tokenProvider) {
      this.tokenProvider.clearCache();
      const idToken = await this.tokenProvider.getIdToken();
      headers.set('Authorization', `Bearer ${idToken}`);
      try {
        response = await fetch(url, { ...init, headers });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new MetraCardsApiError(
          `Failed to reach MetraCards API at ${url}: ${message}`,
        );
      }
    }

    return response;
  }
}
