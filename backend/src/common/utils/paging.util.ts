export interface PageQuery {
  page?: string;
  pageSize?: string;
}

export function paging(query: PageQuery, defaultSize = 25) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || defaultSize, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Returns the value if it is a member of the enum, otherwise undefined. */
export function enumOrUndefined<T extends Record<string, string>>(
  enumObject: T,
  value: string | undefined,
): T[keyof T] | undefined {
  const upper = value?.trim().toUpperCase();
  return upper && (Object.values(enumObject) as string[]).includes(upper)
    ? (upper as T[keyof T])
    : undefined;
}
