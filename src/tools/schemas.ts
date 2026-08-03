import { z } from 'zod';

export const uuidSchema = z.uuid();

export const colorSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{8}$/, 'color must be 8 hex chars (ARGB)');

export const mediaFieldsSchema = {
  audio_file_url: z.string().nullable().optional(),
  image_file_url: z.string().nullable().optional(),
  back_audio_file_url: z.string().nullable().optional(),
  back_image_file_url: z.string().nullable().optional(),
  audio_file_size: z.number().int().optional(),
  image_file_size: z.number().int().optional(),
  back_audio_file_size: z.number().int().optional(),
  back_image_file_size: z.number().int().optional(),
};

export const reviewResponseSchema = z.enum(['again', 'hard', 'good', 'easy']);

export const hhMmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:mm (24h)');

export const daysOfWeekSchema = z.union([
  z.string().min(1),
  z.array(z.number().int().min(1).max(7)).min(1),
]);

export const reviewCreateItemSchema = z.object({
  id: uuidSchema.optional(),
  card_id: uuidSchema,
  response: reviewResponseSchema,
  reviewed_at: z.string().optional(),
});

export const scheduleUpsertItemSchema = z.object({
  id: uuidSchema,
  time: hhMmSchema,
  days_of_week: daysOfWeekSchema,
  enabled: z.boolean().optional(),
});

export const deckCreateItemSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  color: colorSchema.optional(),
  daily_new_cards_limit: z.number().int().min(1).optional(),
});

export const cardCreateItemSchema = z.object({
  id: uuidSchema.optional(),
  deck_id: uuidSchema,
  front: z.string(),
  back: z.string(),
  category: z.string().nullable().optional(),
  ...mediaFieldsSchema,
});
