export function categoryPagePath(category: { handle: string }): string {
  return `/categories/${category.handle}`;
}
