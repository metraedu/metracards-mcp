import { config as loadDotenv } from 'dotenv';

loadDotenv();

export type AppConfig = {
  apiUrl: string;
};

export function loadConfig(): AppConfig {
  const apiUrl =
    process.env.METRACARDS_API_URL?.trim() || 'http://127.0.0.1:3001';
  return { apiUrl: apiUrl.replace(/\/$/, '') };
}

export const config = loadConfig();
