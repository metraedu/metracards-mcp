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
