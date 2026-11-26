import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { LIMITS, type Paginated } from "@sidewalk/contracts";

export class PaginationQuery {
  /** 1-based page number. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page: number = 1;

  /** Items per page. Capped to protect the database. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITS.pageSize.max)
  pageSize: number = LIMITS.pageSize.default;
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): Paginated<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
