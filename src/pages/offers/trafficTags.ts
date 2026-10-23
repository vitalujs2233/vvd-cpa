export const trafficFields = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'] as const;
export type TrafficTags = Partial<Record<typeof trafficFields[number], string>>;
export function taggedLink(base: string, tags: TrafficTags): string {
  const url = new URL(base);
  for (const field of trafficFields) {
    const value = (tags[field] || '').trim();
    if (value) url.searchParams.set(field, value);
    else url.searchParams.delete(field);
  }
  return url.toString();
}
