export type SavedProductListItem = {
  id: string;
  handle?: string;
  title: string;
  price: number;
  discountedPrice: number;
  minPrice?: number;
  maxPrice?: number;
  quantity: number;
  status?: string;
  variantId?: string;
  variantLabel?: string;
  imgs?: {
    thumbnails: string[];
    previews: string[];
  };
};
