export function sanitizeAIPayload<T>(data: T): T {
  if (typeof data === 'string') {
    return data.replace(/<\|"\|/g, '').trim() as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeAIPayload(item)) as unknown as T;
  }
  if (data !== null && typeof data === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      cleaned[key] = sanitizeAIPayload(value);
    }
    return cleaned as T;
  }
  return data;
}