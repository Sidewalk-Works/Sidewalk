/** Matches the API's offset pagination query params. */
export interface PageParams {
  limit?: number;
  offset?: number;
}

/** Matches the API's paginated response shape. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/** @deprecated Cursor pagination is not returned by the current API. */
export interface PageRequest {
  cursor?: string;
  limit: number;
}

/** @deprecated Cursor pagination envelope is not returned by the current API. */
export interface PageResponse<T> {
  data: T[];
  nextCursor?: string;
  total: number;
}

export interface ReportFilter {
  status?: string;
  visibility?: string;
  authorId?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export interface UserFilter {
  search?: string;
  role?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export interface ModerationFilter {
  outcome?: string;
  moderatorId?: string;
  reportId?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}
