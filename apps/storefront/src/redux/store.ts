import { configureStore } from "@reduxjs/toolkit";
import { type TypedUseSelectorHook, useSelector } from "react-redux";
import productDetailsReducer from "./features/product-details";
import quickViewReducer from "./features/quickView-slice";
import recentlyViewedReducer from "./features/recently-viewed-slice";
import wishlistReducer from "./features/wishlist-slice";

export const store = configureStore({
  reducer: {
    quickViewReducer,
    wishlistReducer,
    recentlyViewedReducer,
    productDetailsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
