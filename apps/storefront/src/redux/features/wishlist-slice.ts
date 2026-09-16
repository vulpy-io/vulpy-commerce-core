import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type InitialState = {
  items: WishListItem[];
};

type WishListItem = {
  id: string;
  title: string;
  price: number;
  discountedPrice: number;
  minPrice?: number;
  maxPrice?: number;
  quantity: number;
  status?: string;
  handle?: string;
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

export const wishlist = createSlice({
  name: "wishlist",
  initialState,
  reducers: {
    addItemToWishlist: (state, action: PayloadAction<WishListItem>) => {
      const {
        id,
        title,
        price,
        quantity,
        imgs,
        discountedPrice,
        minPrice,
        maxPrice,
        status,
        variantId,
        handle,
        variantLabel,
      } = action.payload;
      const existingItem = state.items.find((item) => item.id === id);

      if (existingItem) {
        return;
      }

      state.items.push({
        id,
        title,
        price,
        quantity,
        imgs,
        discountedPrice,
        minPrice,
        maxPrice,
        status,
        variantId,
        handle,
        variantLabel,
      });
    },
    hydrateWishlist: (state, action: PayloadAction<WishListItem[]>) => {
      state.items = action.payload;
    },
    removeItemFromWishlist: (state, action: PayloadAction<string>) => {
      const itemId = action.payload;
      state.items = state.items.filter((item) => item.id !== itemId);
    },

    removeAllItemsFromWishlist: (state) => {
      state.items = [];
    },
  },
});

export const {
  addItemToWishlist,
  hydrateWishlist,
  removeItemFromWishlist,
  removeAllItemsFromWishlist,
} = wishlist.actions;
export default wishlist.reducer;
