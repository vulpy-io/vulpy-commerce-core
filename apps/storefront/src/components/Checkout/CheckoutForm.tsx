"use client";

import type { HttpTypes } from "@medusajs/types";
import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  getPaymentProvidersAction,
  getShippingOptionsAction,
} from "@/app/actions/checkout";
import { registerCustomerAction } from "@/app/actions/customer";
import {
  initiatePaymentSessionAction,
  placeOrderAction,
  setCheckoutAddressesAction,
  setShippingMethodAction,
} from "@/app/actions/order";
import { submitQuoteRequestAction } from "@/app/actions/submit-quote-request";
import config from "@/config";
import { usePricePersona } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import {
  paymentProviderCategory,
  submitAddPaymentInfo,
  submitAddShippingInfo,
  submitBeginCheckout,
  trackCustomEvent,
} from "@/lib/analytics";
import { submitPaymentSuccessOnce } from "@/lib/analytics/checkout-analytics";
import type { CmsPaymentMethod } from "@/lib/cms/types";
import { stripePromise } from "@/lib/stripe";
import Billing from "./Billing";
import CheckoutLayout from "./CheckoutLayout";
import {
  type CheckoutAddressForm,
  CheckoutLoginPanel,
  CheckoutOrderSummary,
  DeliveryMethodStep,
  PaymentInformationStep,
  ShippingInformationStep,
} from "./CheckoutSteps";
import Coupon from "./Coupon";
import {
  buildContactShippingAddress,
  createCheckoutFormFromCart,
} from "./checkout-form-data";
import {
  type CheckoutAction,
  type CheckoutEventPayload,
  transition,
} from "./checkout-state-machine";
import { isPaymentPrerequisitesMet } from "./payment-session-state";

function isSystemDefaultPayment(providerId: string) {
  return providerId.includes("system");
}

function getCheckoutButtonLabel({
  isPending,
  isCod,
  isQuote,
}: {
  isPending: boolean;
  isCod: boolean;
  isQuote: boolean;
}) {
  if (isPending) {
    return "Processing...";
  }

  if (isQuote) {
    return "Submit quote request";
  }

  if (isCod) {
    return "Place order";
  }

  return "Pay now";
}

function StripePayButton({
  cart,
  disabled,
  isCod,
  isStale,
  onRefresh,
  prepareCheckout,
  onDispatch,
}: {
  cart: HttpTypes.StoreCart;
  disabled: boolean;
  isCod: boolean;
  isStale: boolean;
  onRefresh: () => Promise<unknown>;
  prepareCheckout: () => Promise<HttpTypes.StoreCart | undefined>;
  onDispatch: (event: CheckoutAction["type"], payload?: CheckoutEventPayload) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();
  const hasAnalytics = useHasAnalyticsConsent();

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh().finally(() => setIsRefreshing(false));
  };

  const handlePayment = () => {
    startTransition(async () => {
      if (!(stripe && elements && cart)) {
        return;
      }

      // Idempotency: if already confirming or completing, ignore duplicate click
      if (disabled) {
        return;
      }

      try {
        await prepareCheckout();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save order details"
        );
        return;
      }

      onDispatch("CONFIRM");

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order/payment-return`,
        },
        redirect: "if_required",
      });

      if (error) {
        if (hasAnalytics) {
          trackCustomEvent("Checkout", "payment_failure", "stripe");
        }
        toast.error(error.message ?? "Payment failed");
        onDispatch("CONFIRM_ERROR", { message: error.message ?? "Payment failed", recoverable: true });
        return;
      }

      onDispatch("PLACE_ORDER");

      try {
        const result = await placeOrderAction();
        if (result && "error" in result) {
          toast.error(result.error ?? "Could not complete order");
          onDispatch("ORDER_ERROR", { message: result.error, recoverable: result.recoverable });
          return;
        }
        if (result && "status" in result && result.status === "already_completed") {
          // Already completed — treat as success (idempotent)
          onDispatch("ORDER_COMPLETE", { orderId: "" });
          router.refresh();
          return;
        }
        submitPaymentSuccessOnce("", hasAnalytics);
      } catch (error) {
        if (isRedirectError(error)) {
          throw error;
        }
        onDispatch("ORDER_ERROR", { message: "An unexpected error occurred", recoverable: false });
        router.refresh();
      }
    });
  };

  if (isStale) {
    return (
      <button
        className="mt-7.5 flex w-full justify-center rounded-md bg-action-primary-background px-6 py-3 font-semibold text-white hover:bg-action-primary-hover disabled:opacity-50"
        disabled={isRefreshing}
        onClick={handleRefresh}
        type="button"
      >
        {isRefreshing ? "Refreshing payment..." : "Refresh payment"}
      </button>
    );
  }

  return (
    <button
      className="mt-7.5 flex w-full justify-center rounded-md bg-action-primary-background px-6 py-3 font-semibold text-white hover:bg-action-primary-hover disabled:opacity-50"
      disabled={disabled || isPending}
      onClick={handlePayment}
      type="button"
    >
      {getCheckoutButtonLabel({ isPending, isCod, isQuote: false })}
    </button>
  );
}

export default function CheckoutForm({
  customerEmail,
  initialCart,
  initialShippingOptions = [],
  initialPaymentProviders = [],
  paymentMethods,
  siteSettings,
}: {
  customerEmail?: string | null;
  initialCart: HttpTypes.StoreCart | null;
  initialShippingOptions?: HttpTypes.StoreCartShippingOption[];
  initialPaymentProviders?: HttpTypes.StorePaymentProvider[];
  paymentMethods?: CmsPaymentMethod[];
  siteSettings: import("@/lib/cms/types").CmsSiteSettings;
}) {
  const { cart: contextCart, applyCartResult } = useCart();
  const storeCurrency = useStoreCurrency();
  const hasAnalytics = useHasAnalyticsConsent();
  const persona = usePricePersona();
  const isQuotePersona = persona === "quote";
  const beginCheckoutTracked = useRef(false);
  const cart = contextCart ?? initialCart;
  const [shippingOptions, setShippingOptions] = useState<
    HttpTypes.StoreCartShippingOption[]
  >(initialShippingOptions);
  const [paymentProviders, setPaymentProviders] = useState<
    HttpTypes.StorePaymentProvider[]
  >(initialPaymentProviders);
  const [selectedShipping, setSelectedShipping] = useState(
    () => initialShippingOptions[0]?.id ?? ""
  );
  const [selectedPayment, setSelectedPayment] = useState(
    () => initialPaymentProviders[0]?.id ?? ""
  );
  const [isPendingShipping, startTransition] = useTransition();

  // State machine: replaces ad-hoc isProcessing/isSaving booleans
  const [checkoutState, dispatch] = useReducer(transition, { step: "editing" });

  const dispatchCheckout = (event: CheckoutAction["type"], payload?: CheckoutEventPayload) => {
    dispatch({ type: event, ...payload } as unknown as CheckoutAction);
  };

  const isProcessing =
    checkoutState.step === "saving_cart" ||
    checkoutState.step === "confirming" ||
    checkoutState.step === "completing_order";

  // Payment session state
  const [clientSecret, setClientSecret] = useState<string | null>(() => {
    const session = initialCart?.payment_collection?.payment_sessions?.find(
      (s) => s.status === "pending"
    );
    return (session?.data?.client_secret as string | undefined) ?? null;
  });
  const [paymentSessionReady, setPaymentSessionReady] = useState(
    () => !!clientSecret
  );
  const [paymentSessionStale, setPaymentSessionStale] = useState(false);
  // Track cart total to detect mutations that invalidate the session
  const prevCartTotalRef = useRef<number | null>(null);
  const paymentSessionInitRef = useRef<{
    key: string;
    promise: Promise<boolean>;
  } | null>(null);

  const [checkoutForm, setCheckoutForm] = useState<CheckoutAddressForm>(() =>
    createCheckoutFormFromCart(cart)
  );
  const [createAccount, setCreateAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [billingForm, setBillingForm] = useState<CheckoutAddressForm>(() =>
    createCheckoutFormFromCart(cart)
  );

  const selectedShippingOption = shippingOptions.find(
    (option) => option.id === selectedShipping
  );
  const isStripePayment = selectedPayment.includes("stripe");

  const applyShippingToCart = useCallback(
    async (shippingId: string, requestId: number) => {
      const result = await setShippingMethodAction(shippingId);

      if (requestId !== shippingSyncRequestRef.current) {
        return;
      }

      if (result && "cart" in result && result.cart) {
        applyCartResult(result, { mutation: "checkout", source: "shipping" });
      } else if (result && "checkoutBlocked" in result) {
        applyCartResult(result, { mutation: "checkout", source: "shipping" });
      }
    },
    [applyCartResult]
  );

  const shippingSyncRequestRef = useRef(0);
  const shippingUserActionRef = useRef(false);

  useEffect(() => {
    if (!(hasAnalytics && cart?.items?.length) || beginCheckoutTracked.current) {
      return;
    }
    beginCheckoutTracked.current = true;
    submitBeginCheckout(cart);
  }, [hasAnalytics, cart]);

  useEffect(() => {
    if (!selectedShipping) {
      return;
    }

    if (!shippingUserActionRef.current) {
      return;
    }

    const requestId = ++shippingSyncRequestRef.current;

    startTransition(async () => {
      try {
        await applyShippingToCart(selectedShipping, requestId);
      } catch {
        // Totals may lag until checkout details are saved.
      }
    });
  }, [applyShippingToCart, selectedShipping]);

  useEffect(() => {
    if (initialShippingOptions.length) {
      return;
    }
    if (!cart?.id) {
      return;
    }
    getShippingOptionsAction(cart.id).then((opts) => {
      if (opts) {
        setShippingOptions(opts);
        if (opts[0]) {
          setSelectedShipping(opts[0].id);
        }
      }
    });
    if (cart.region_id && !initialPaymentProviders.length) {
      getPaymentProvidersAction(cart.region_id).then((providers) => {
        if (providers) {
          setPaymentProviders(providers);
          if (providers[0]) {
            setSelectedPayment(providers[0].id);
          }
        }
      });
    }
  }, [cart?.id, cart?.region_id, initialPaymentProviders.length, initialShippingOptions.length]);

  // Detect cart-total mutations and mark payment session stale
  useEffect(() => {
    if (!cart) { return; }
    const total = cart.total ?? 0;
    if (prevCartTotalRef.current !== null && prevCartTotalRef.current !== total && paymentSessionReady && clientSecret) {
        setPaymentSessionStale(true);
      }
    prevCartTotalRef.current = total;
  }, [cart, cart?.total, paymentSessionReady, clientSecret]);

  // Initiate payment session when prerequisites settle (Stripe only)
  const initiateStripeSession = useCallback(async (): Promise<boolean> => {
    if (!(cart?.id && isStripePayment)) { return false; }
    const prerequisites = isPaymentPrerequisitesMet({
      shippingAddress: checkoutForm
        ? {
            first_name: checkoutForm.first_name,
            last_name: checkoutForm.last_name,
            address_1: checkoutForm.address_1,
            city: checkoutForm.city,
            country_code: checkoutForm.country_code,
            postal_code: checkoutForm.postal_code,
          }
        : null,
      shippingMethodId: selectedShipping,
      cartTotal: cart.total ?? 0,
    });

    if (!prerequisites) { return false; }

    try {
      const result = await initiatePaymentSessionAction(cart.id, selectedPayment);
      if (result.status === "success" && result.cart) {
        const session = result.cart.payment_collection?.payment_sessions?.find(
          (s) => s.status === "pending" && s.provider_id === selectedPayment
        );
        const secret = session?.data?.client_secret as string | undefined;
        if (secret) {
          applyCartResult(result, { mutation: "checkout", source: "payment" });
          setClientSecret(secret);
          setPaymentSessionReady(true);
          setPaymentSessionStale(false);
          return true;
        }
      }
      // Error result or missing session — surface it instead of failing silently
      const message =
        result.status === "error" && "error" in result && result.error
          ? result.error
          : "Payment session could not be initiated.";
      if (hasAnalytics) {
        trackCustomEvent("Checkout", "checkout_error", "payment_session_init");
      }
      toast.error(message);
      return false;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Payment session could not be initiated.";
      if (hasAnalytics) {
        trackCustomEvent("Checkout", "checkout_error", "payment_session_init");
      }
      toast.error(message);
      return false;
    }
  }, [
    cart?.id,
    cart?.total,
    selectedPayment,
    selectedShipping,
    checkoutForm,
    applyCartResult,
    hasAnalytics,
    isStripePayment,
  ]);

  // Render the PaymentElement before the Pay click. Primitive address
  // dependencies plus a short debounce prevent one request per keystroke;
  // the key/in-flight guard also handles rerenders and Strict Mode.
  useEffect(() => {
    const address = checkoutForm;
    const prerequisites = isPaymentPrerequisitesMet({
      shippingAddress: address,
      shippingMethodId: selectedShipping,
      cartTotal: cart?.total ?? 0,
    });

    const canInitializeStripeSession =
      isStripePayment && Boolean(cart?.id) && prerequisites;

    if (!canInitializeStripeSession || paymentSessionReady || paymentSessionStale) {
      return;
    }

    const key = [
      cart.id,
      selectedPayment,
      selectedShipping,
      cart.total ?? 0,
      address.first_name,
      address.last_name,
      address.address_1,
      address.city,
      address.country_code,
      address.postal_code,
    ].join("\u001f");

    if (paymentSessionInitRef.current?.key === key) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (paymentSessionInitRef.current?.key === key) {
        return;
      }
      const promise = initiateStripeSession().finally(() => {
        if (paymentSessionInitRef.current?.key === key) {
          paymentSessionInitRef.current = null;
        }
      });
      paymentSessionInitRef.current = { key, promise };
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [
    cart?.id,
    cart?.total,
    checkoutForm.first_name,
    checkoutForm.last_name,
    checkoutForm.address_1,
    checkoutForm.city,
    checkoutForm.country_code,
    checkoutForm.postal_code,
    initiateStripeSession,
    isStripePayment,
    paymentSessionReady,
    paymentSessionStale,
    selectedPayment,
    selectedShipping,
  ]);

  if (!cart?.items?.length) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4">Your cart is empty.</p>
        <a className="text-content-brand" href="/shop">
          Continue shopping
        </a>
      </div>
    );
  }

  const isStripe = isStripePayment;
  const isCod = isSystemDefaultPayment(selectedPayment);
  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending" && s.provider_id === selectedPayment
  );

  const currency = cart.currency_code ?? storeCurrency;
  const isGuestCheckout = !customerEmail;
  const showCustomerAccountFeatures =
    config.customerAccountsEnabled && isGuestCheckout;

  const registerGuestAccount = async () => {
    if (!(config.customerAccountsEnabled && createAccount)) {
      return;
    }

    const email = checkoutForm.email.trim();
    if (!email) {
      throw new Error("Enter an email address to create an account");
    }

    if (!accountPassword) {
      throw new Error("Enter a password for your account");
    }

    await registerCustomerAction(
      {
        email,
        password: accountPassword,
        first_name: checkoutForm.first_name,
        last_name: checkoutForm.last_name,
      },
      null
    );
  };

  const saveCheckoutDetails = async () => {
    if (showCustomerAccountFeatures) {
      await registerGuestAccount();
    }

    const shippingAddress = buildContactShippingAddress(checkoutForm);
    const billingAddress = sameAsShipping
      ? shippingAddress
      : buildContactShippingAddress(billingForm);

    const addressResult = await setCheckoutAddressesAction({
      email: checkoutForm.email.trim() || undefined,
      shipping_address: shippingAddress,
      billing_address: billingAddress,
    });
    if (addressResult) {
      applyCartResult(addressResult, { mutation: "checkout", source: "address" });
      if (hasAnalytics) {
        trackCustomEvent("Checkout", "checkout_details_complete");
      }
    }

    if (selectedShipping) {
      const shippingResult = await setShippingMethodAction(selectedShipping);
      if (shippingResult && "cart" in shippingResult) {
        applyCartResult(shippingResult, {
          mutation: "checkout",
          source: "shipping",
        });
      }
    }

    return contextCart ?? initialCart;
  };

  const handleProcessCheckout = () => {
    // Guard: if already processing (saving cart or placing order), ignore
    if (isProcessing) {
      return;
    }

    // Quote persona: submitting a quotation request, not a payment.
    // Task 5 creates the draft order behind submitQuoteRequestAction; until
    // then the stub returns ok without side effects.
    if (isQuotePersona) {
      startTransition(async () => {
        dispatchCheckout("SAVE_CART");
        try {
          await saveCheckoutDetails();
          dispatchCheckout("SAVE_CART_DONE");
          const result = await submitQuoteRequestAction(cart?.id ?? "");
          if (result.ok) {
            dispatchCheckout("ORDER_COMPLETE", { orderId: "" });
          } else if ("error" in result) {
            toast.error(result.error ?? "Could not submit quote request");
            dispatchCheckout("ORDER_ERROR", {
              message: result.error ?? "Could not submit quote request",
              recoverable: true,
            });
          } else {
            toast.error("Could not submit quote request");
            dispatchCheckout("ORDER_ERROR", {
              message: "Could not submit quote request",
              recoverable: true,
            });
          }
        } catch (error) {
          if (isRedirectError(error)) {
            throw error;
          }
          toast.error(
            error instanceof Error ? error.message : "Could not submit quote request"
          );
          dispatchCheckout("ORDER_ERROR", {
            message: error instanceof Error ? error.message : "Could not submit quote request",
            recoverable: false,
          });
        }
      });
      return;
    }

    startTransition(async () => {
      dispatchCheckout("SAVE_CART");
      try {
        await saveCheckoutDetails();
        dispatchCheckout("SAVE_CART_DONE");

        if (isStripe) {
          // Initiate session if not already ready
          if (!paymentSessionReady) {
            const sessionReady = await initiateStripeSession();
            if (!sessionReady) {
              // Error already toasted — leave the form in a retryable state
              dispatchCheckout("CONFIRM_ERROR", {
                message: "Payment session could not be initiated. Please try again.",
                recoverable: true,
              });
              return;
            }
          }
          return;
        }

        dispatchCheckout("PLACE_ORDER");
        const result = await placeOrderAction();
        if (result && "error" in result) {
          if (hasAnalytics) {
            trackCustomEvent("Checkout", "checkout_error", "place_order");
          }
          toast.error(result.error ?? "Could not complete checkout");
          dispatchCheckout("ORDER_ERROR", { message: result.error, recoverable: result.recoverable });
        } else if (result && "status" in result && result.status === "already_completed") {
          // Idempotent success
          dispatchCheckout("ORDER_COMPLETE", { orderId: "" });
        } else {
          submitPaymentSuccessOnce("", hasAnalytics);
        }
      } catch (error) {
        if (isRedirectError(error)) {
          throw error;
        }
        if (hasAnalytics) {
          trackCustomEvent("Checkout", "checkout_error", "place_order");
        }
        toast.error(
          error instanceof Error ? error.message : "Could not complete checkout"
        );
        dispatchCheckout("ORDER_ERROR", { message: error instanceof Error ? error.message : "Could not complete checkout", recoverable: false });
      }
    });
  };

  const checkoutButtonLabel = getCheckoutButtonLabel({ isPending: isProcessing, isCod, isQuote: isQuotePersona });
  const handleSelectShipping = (shippingId: string) => {
    shippingUserActionRef.current = true;
    setSelectedShipping(shippingId);
    if (hasAnalytics) {
      const tier =
        shippingOptions.find((option) => option.id === shippingId)?.name ?? shippingId;
      submitAddShippingInfo(cart, tier);
    }
  };

  const handleSelectPayment = (paymentId: string) => {
    setSelectedPayment(paymentId);
    if (hasAnalytics) {
      submitAddPaymentInfo(cart, paymentProviderCategory(paymentId));
    }
  };

  const showStripePayButton =
    !isQuotePersona && isStripe && paymentSessionReady && clientSecret && !isCod;

  const checkoutContent = (
    <section className="overflow-hidden py-10 sm:py-14">
      <div className="container w-full">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleProcessCheckout();
          }}
        >
          <div className="flex flex-col gap-7.5 lg:flex-row xl:gap-11">
            <div className="w-full lg:max-w-[670px]">
              {config.customerAccountsEnabled ? (
                <CheckoutLoginPanel customerEmail={customerEmail} />
              ) : null}
              <ShippingInformationStep
                accountPassword={accountPassword}
                createAccount={createAccount}
                form={checkoutForm}
                onAccountPasswordChange={setAccountPassword}
                onChange={setCheckoutForm}
                onCreateAccountChange={setCreateAccount}
                regionCountries={cart?.region?.countries}
                showCreateAccount={showCustomerAccountFeatures}
              />
              <Billing
                billingForm={billingForm}
                onBillingFormChange={setBillingForm}
                onSameAsShippingChange={setSameAsShipping}
                regionCountries={cart?.region?.countries}
                sameAsShipping={sameAsShipping}
              />
            </div>

            <div className="w-full max-w-[455px]">
              <CheckoutOrderSummary
                cart={cart}
                currency={currency}
                selectedShippingOption={selectedShippingOption}
                supportPhone={siteSettings.supportPhone || siteSettings.contactInfo.phone}
              />
              {process.env.NEXT_PUBLIC_ENABLE_PROMOTION_CODES !== "false" && (
                <Coupon />
              )}
              <DeliveryMethodStep
                currency={currency}
                onSelect={handleSelectShipping}
                selectedShipping={selectedShipping}
                shippingOptions={shippingOptions}
              />
              <PaymentInformationStep
                isStripe={isStripe}
                onSelectPayment={handleSelectPayment}
                paymentMethods={paymentMethods}
                paymentProviders={paymentProviders}
                paymentSession={paymentSession}
                paymentSessionReady={paymentSessionReady}
                selectedPayment={selectedPayment}
              >
                {null}
              </PaymentInformationStep>
              {showStripePayButton ? (
                <StripePayButton
                  cart={cart}
                  disabled={isProcessing}
                  isCod={isCod}
                  isStale={paymentSessionStale}
                  onDispatch={dispatchCheckout}
                  onRefresh={initiateStripeSession}
                  prepareCheckout={saveCheckoutDetails}
                />
              ) : (
                <button
                  className="mt-7.5 flex w-full justify-center rounded-md bg-action-primary-background px-6 py-3 font-semibold text-white hover:bg-action-primary-hover disabled:opacity-50"
                  disabled={
                    isProcessing ||
                    (!isQuotePersona && (!(selectedPayment && selectedShipping)))
                  }
                  type="submit"
                >
                  {checkoutButtonLabel}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  );

  return (
    <CheckoutLayout siteSettings={siteSettings}>
      {isStripe && paymentSessionReady && clientSecret && stripePromise ? (
        <Elements
          options={{
            clientSecret,
          }}
          stripe={stripePromise}
        >
          {checkoutContent}
        </Elements>
      ) : (
        checkoutContent
      )}
    </CheckoutLayout>
  );
}
