import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const MAX_ITEMS = 12;

type InitialState = {
  items: RecentlyViewedItem[];
};

export type RecentlyViewedItem = {
  handle: string;
  id: string;
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

const initialState: InitialState = {
  items: [],
};

export const recentlyViewed = createSlice({
  name: "recentlyViewed",
  initialState,
  reducers: {
    addRecentlyViewed: (state, action: PayloadAction<RecentlyViewedItem>) => {
      const item = action.payload;
      state.items = [
        item,
        ...state.items.filter((existing) => existing.handle !== item.handle),
      ].slice(0, MAX_ITEMS);
    },
    hydrateRecentlyViewed: (state, action: PayloadAction<RecentlyViewedItem[]>) => {
      state.items = action.payload.slice(0, MAX_ITEMS);
    },
    removeRecentlyViewed: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((item) => item.handle !== action.payload);
    },
    clearRecentlyViewed: (state) => {
      state.items = [];
    },
  },
});

export const {
  addRecentlyViewed,
  hydrateRecentlyViewed,
  removeRecentlyViewed,
  clearRecentlyViewed,
} = recentlyViewed.actions;
export default recentlyViewed.reducer;
