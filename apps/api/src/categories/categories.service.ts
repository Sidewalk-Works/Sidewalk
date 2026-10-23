import { Injectable } from "@nestjs/common";
import type { CategoryDto } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

const toDto = (c: {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}): CategoryDto => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description,
  isActive: c.isActive,
  sortOrder: c.sortOrder
});

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(includeInactive = false): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
    return rows.map(toDto);
  }

  async create(
    actorId: string,
    data: { name: string; description: string; sortOrder?: number }
  ): Promise<CategoryDto> {
    const slug = slugify(data.name);
    if (!slug)
      throw AppError.badRequest(
        "INVALID_NAME",
        "Give the category a name with letters or numbers."
      );
    const clash = await this.prisma.category.findFirst({
      where: { OR: [{ slug }, { name: { equals: data.name, mode: "insensitive" } }] }
    });
    if (clash)
      throw AppError.conflict("CATEGORY_EXISTS", "A category with that name already exists.");
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          slug,
          name: data.name.trim(),
          description: data.description.trim(),
          sortOrder: data.sortOrder ?? 100
        }
      });
      await this.audit.record(
        {
          actorId,
          action: "category.created",
          entityType: "Category",
          entityId: created.id,
          metadata: { slug }
        },
        tx
      );
      return toDto(created);
    });
  }

  async update(
    actorId: string,
    id: string,
    data: { name?: string; description?: string; isActive?: boolean; sortOrder?: number }
  ): Promise<CategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("We could not find that category.");
    if (data.name && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await this.prisma.category.findFirst({
        where: { id: { not: id }, name: { equals: data.name.trim(), mode: "insensitive" } }
      });
      if (clash)
        throw AppError.conflict("CATEGORY_EXISTS", "A category with that name already exists.");
    }
    if (data.isActive === false) {
      const activeCount = await this.prisma.category.count({
        where: { isActive: true, id: { not: id } }
      });
      if (activeCount === 0)
        throw AppError.conflict(
          "LAST_CATEGORY",
          "At least one category must stay active so residents can file reports."
        );
    }
    // The slug is part of public URLs and filters, so renaming never changes it.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: {
          name: data.name?.trim(),
          description: data.description?.trim(),
          isActive: data.isActive,
          sortOrder: data.sortOrder
        }
      });
      await this.audit.record(
        {
          actorId,
          action: "category.updated",
          entityType: "Category",
          entityId: id,
          metadata: { changed: Object.keys(data) }
        },
        tx
      );
      return toDto(updated);
    });
  }
}
