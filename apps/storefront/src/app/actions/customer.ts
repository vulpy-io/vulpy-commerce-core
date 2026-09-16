"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMedusaClient } from "@/lib/medusa/client";
import { getCartId, removeAuthToken, setAuthToken } from "@/lib/medusa/cookies";

type CustomerProfileInput = {
  first_name: string;
  last_name: string;
  phone?: string;
};

type CustomerAddressInput = {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  country_code: string;
  postal_code: string;
  province?: string;
  phone?: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
};

export async function loginCustomerAction(
  email: string,
  password: string,
  redirectTo = "/my-account"
) {
  const medusa = await getMedusaClient();

  const token = await medusa.auth.login("customer", "emailpass", {
    email,
    password,
  });

  if (typeof token !== "string") {
    throw new Error("Invalid email or password");
  }

  await setAuthToken(token);

  const cartId = await getCartId();
  if (cartId) {
    await medusa.store.cart.transferCart(cartId, {}, {
      Authorization: `Bearer ${token}`,
    });
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function registerCustomerAction(
  data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  },
  redirectTo: string | null = "/my-account"
) {
  const medusa = await getMedusaClient();

  const token = await medusa.auth.register("customer", "emailpass", {
    email: data.email,
    password: data.password,
  });

  if (typeof token !== "string") {
    throw new Error("Registration failed");
  }

  await setAuthToken(token);

  await medusa.store.customer.create(
    {
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
    },
    {},
    { Authorization: `Bearer ${token}` }
  );

  const loginToken = await medusa.auth.login("customer", "emailpass", {
    email: data.email,
    password: data.password,
  });

  if (typeof loginToken !== "string") {
    throw new Error("Registration failed");
  }

  await setAuthToken(loginToken);

  const cartId = await getCartId();
  if (cartId) {
    await medusa.store.cart.transferCart(cartId, {}, {
      Authorization: `Bearer ${loginToken}`,
    });
  }

  revalidatePath("/", "layout");

  if (redirectTo !== null) {
    redirect(redirectTo);
  }
}

export async function logoutCustomerAction() {
  const medusa = await getMedusaClient();
  await medusa.auth.logout();
  await removeAuthToken();
  revalidatePath("/", "layout");
  redirect("/signin");
}

export async function updateCustomerProfileAction(data: CustomerProfileInput) {
  const medusa = await getMedusaClient();
  await medusa.store.customer.update({
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
  });

  revalidatePath("/my-account");
}

export async function createCustomerAddressAction(data: CustomerAddressInput) {
  const medusa = await getMedusaClient();
  await medusa.client.fetch("/store/customers/me/addresses", {
    method: "POST",
    body: {
      address: data,
    },
  });

  revalidatePath("/my-account");
}

export async function updateCustomerAddressAction(
  addressId: string,
  data: CustomerAddressInput
) {
  const medusa = await getMedusaClient();
  await medusa.client.fetch(`/store/customers/me/addresses/${addressId}`, {
    method: "PATCH",
    body: {
      address: data,
    },
  });

  revalidatePath("/my-account");
}

export async function deleteCustomerAddressAction(addressId: string) {
  const medusa = await getMedusaClient();
  await medusa.client.fetch(`/store/customers/me/addresses/${addressId}`, {
    method: "DELETE",
  });

  revalidatePath("/my-account");
}
