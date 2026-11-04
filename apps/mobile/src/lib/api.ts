import { Platform } from 'react-native';
import type { CatalogResponse } from './types';

declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };

const localApiUrl = Platform.select({
  android: 'http://10.0.2.2:4000/api/v1',
  default: 'http://localhost:4000/api/v1',
}) ?? 'http://localhost:4000/api/v1';
const apiUrl = process.env.EXPO_PUBLIC_API_URL || localApiUrl;

export async function listProducts(query = '', category = ''): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  if (category) params.set('category', category);

  const search = params.toString();
  const suffix = search ? `?${search}` : '';
  const response = await fetch(`${apiUrl}/products${suffix}`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error?.message || 'Katalog belum dapat dimuat.');
  }

  return result.data as CatalogResponse;
}
