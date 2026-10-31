export type ApplicationSort =
  | "match_desc"
  | "published_desc"
  | "updated_desc"
  | "company_asc"
  | "title_asc";

export interface ApplicationListFilters {
  query: string;
  status: string;
  platform: string;
  countryCode: string;
  minimumScore: number | null;
}

interface FilterableApplication {
  id: string;
  status: string;
  platform: string;
  countryCode: string;
  matchScore: number;
  title: string;
  company: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function filterAndSortApplications<T extends FilterableApplication>(
  applications: readonly T[],
  filters: ApplicationListFilters,
  sort: ApplicationSort,
) {
  const query = filters.query.trim().toLocaleLowerCase();
  return applications
    .filter((application) => {
      if (filters.status !== "all" && application.status !== filters.status) return false;
      if (filters.platform !== "all" && application.platform !== filters.platform) return false;
      if (filters.countryCode !== "all" && application.countryCode !== filters.countryCode) return false;
      if (filters.minimumScore !== null && application.matchScore < filters.minimumScore) return false;
      if (!query) return true;
      return `${application.title} ${application.company}`.toLocaleLowerCase().includes(query);
    })
    .toSorted((left, right) => compareApplications(left, right, sort));
}

function compareApplications(
  left: FilterableApplication,
  right: FilterableApplication,
  sort: ApplicationSort,
) {
  if (sort === "match_desc") {
    return right.matchScore - left.matchScore || newestFirst(left.updatedAt, right.updatedAt) || left.id.localeCompare(right.id);
  }
  if (sort === "published_desc") {
    return newestFirst(left.publishedAt ?? left.createdAt, right.publishedAt ?? right.createdAt) || left.id.localeCompare(right.id);
  }
  if (sort === "company_asc") {
    return left.company.localeCompare(right.company) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  }
  if (sort === "title_asc") {
    return left.title.localeCompare(right.title) || left.company.localeCompare(right.company) || left.id.localeCompare(right.id);
  }
  return newestFirst(left.updatedAt, right.updatedAt) || left.id.localeCompare(right.id);
}

function newestFirst(left: string, right: string) {
  return new Date(right).getTime() - new Date(left).getTime();
}
