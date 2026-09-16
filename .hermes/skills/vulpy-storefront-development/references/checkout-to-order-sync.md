# Checkout form field → order display sync

When adding a new checkout form field (e.g. `company`) that's part of the
shipping or billing address, it must be surfaced in the post-purchase
confirmation page AND the My Account order view in the same PR.

| Component | File | Pattern |
|---|---|---|
| Order confirmed page | `OrderConfirmedView.tsx` → `OrderShippingAddress` | Add after contact name, before `address_1` |
| My Account order details | `OrderDetails.tsx` (~line 61) | Same pattern, after contact name |

The checkout form components and the order-display components are separate —
adding a field to `ShippingInformationStep` or `Billing.tsx` does not
automatically show it on the confirmation page. Always check both surfaces.

This gap was discovered during the 2026-08-19 checkout epic: the `company`
field was added to the form but absent from `OrderConfirmedView` and
`OrderDetails`. The operator noticed it was missing on the success page.