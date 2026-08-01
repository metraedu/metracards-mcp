import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { AuthRequiredError } from '../auth/token-provider.js';
import {
  MetraCardsApiClient,
  MetraCardsApiError,
} from '../clients/metracards-api.js';

const colorSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{8}$/, 'color must be 8 hex chars (ARGB)');

const uuidSchema = z.string().uuid();

function textResult(payload: unknown, isError = false) {
  return {
    isError,
    content: [
      { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function mapToolError(err: unknown) {
  if (err instanceof AuthRequiredError) {
    return textResult(
      {
        ok: false,
        error: err.message || 'Not authenticated',
        hint: 'Call auth_login to sign in before using deck tools.',
      },
      true,
    );
  }
  if (err instanceof MetraCardsApiError) {
    return textResult(
      {
        ok: false,
        error: err.message,
        statusCode: err.statusCode ?? null,
        body: err.body ?? null,
      },
      true,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return textResult({ ok: false, error: message }, true);
}

export function registerDecksTools(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_list',
    {
      description: 'List decks for the authenticated MetraCards user',
      inputSchema: z.object({
        since: z.string().min(1).optional(),
      }),
    },
    async ({ since }) => {
      try {
        const decks = await client.listDecks(since);
        return textResult(decks);
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_get',
    {
      description: 'Get a deck by id (includes detail fields from the API)',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.getDeck(id));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_create',
    {
      description: 'Create a deck for the authenticated user',
      inputSchema: z.object({
        id: uuidSchema.optional(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        color: colorSchema.optional(),
        daily_new_cards_limit: z.number().int().min(1).optional(),
      }),
    },
    async (input) => {
      try {
        return textResult(await client.createDeck(input));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_update',
    {
      description: 'Update a deck by id',
      inputSchema: z.object({
        id: uuidSchema,
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        color: colorSchema.optional(),
        daily_new_cards_limit: z.number().int().min(1).optional(),
      }),
    },
    async ({ id, ...body }) => {
      try {
        return textResult(await client.updateDeck(id, body));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_delete',
    {
      description: 'Soft-delete a deck by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.deleteDeck(id));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );
}
