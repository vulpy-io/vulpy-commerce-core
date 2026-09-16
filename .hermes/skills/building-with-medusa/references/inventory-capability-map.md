# Medusa 2.13.0 Inventory Capability Map (verified against installed packages)

Verified 2026-08-13 by probing `@medusajs/medusa@2.13.0` + `@medusajs/inventory@2.13.0` dist in the vulpy-commerce workspace. Use this to ground "what's missing" / client-scoping answers in the installed code, not docs.

## Probe recipe

```bash
cd /app/workspace
MEDUSA=apps/medusa-backend/node_modules/@medusajs/medusa
grep '"version"' "$MEDUSA/package.json"     # e.g. 2.13.0
ls "$MEDUSA/dist/api/admin/" | grep -iE 'inventory|reservation|stock|location|fulfillment|order'
# core module barrels re-export from split packages — resolve the real one:
INV=$(ls -d node_modules/.pnpm/@medusajs+inventory@*/node_modules/@medusajs/inventory | head -1)
ls "$INV/dist/models/"                       # entity list — absence proves missing domains
# bundled JS is minified; read the .d.ts method surface instead:
grep -oE "^    [a-zA-Z]+\(" "$INV/dist/services/inventory-module.d.ts" | sort -u
```

## Inventory module service surface (2.13.0)

- Items: `createInventoryItems` / `updateInventoryItems`
- Levels: `createInventoryLevels` / `updateInventoryLevels` / `deleteInventoryLevel` / `deleteInventoryItemLevelByLocationId`
- Adjustments: `adjustInventory`
- Reservations: `createReservationItems` / `updateReservationItems` / `deleteReservationItems` / `softDeleteReservationItems` / `restoreReservationItems` / `restoreReservationItemsByLineItem` / `deleteReservationItemByLocationId` / `deleteReservationItemsByLineItem`
- Fulfillment: `confirmInventory`
- Reads: `retrieveAvailableQuantity` / `retrieveReservedQuantity` / `retrieveStockedQuantity` / `retrieveInventoryLevelByItemAndLocation`

Models: `inventory-item`, `inventory-level`, `reservation-item`.

## Admin API dirs present (2.13.0)

`inventory-items` (+ `location-levels/batch`), `reservations`, `stock-locations`, `fulfillment-sets`, `fulfillments`, `returns`, `return-reasons`, `order-edits`, `draft-orders`.

## Confirmed ABSENT in core 2.13.0

- **Stock transfer between locations** — no service method, no admin route; only per-location adjust/batch adjust. Moving stock warehouse→warehouse must be built (workflow wrapping two-location adjust + audit record).
- **Suppliers / purchase orders / receiving** — no supplier entity, no PO module. The biggest gap for "proper inventory management": no replenishment loop.
- **Lot / serial / batch / expiry tracking** — nothing (matters for food, pharma, electronics).
- **Reorder points / low-stock thresholds** — no native alerting.
- **Movement ledger / stock valuation** — core keeps current state only; no history, no COGS.
- **WMS ops** (bins, picking/packing, scanning), **UoM / fractional quantities**, **forecasting**.

## Present

- `allow_backorder` (product-variants + draft-orders validators) → backorder path is native.
- Multi-warehouse basics: stock locations, sales-channel↔location links, fulfillment sets on shipping options (location routing).
- Admin UI + CSV import/export for items/levels.

## Gap → build vs buy (client-scoping matrix)

| Need | Verdict | Approach |
|---|---|---|
| Reorder points + low-stock alerts | Build (days) | subscriber on `inventory-levels.updated` + email plugin + admin widget |
| Movement ledger / valuation | Build | append-only subscriber; enables COGS/audit/reporting later |
| Suppliers + PO + receiving | Build (the core gap) | custom module (supplier, purchase-order, PO line); receiving workflow calls `adjustInventory` |
| Transfers between locations | Build | workflow wrapping two-location adjust + audit record |
| Stock takes / cycle counts | Build | count sheets + variance + approval |
| WMS (picking/packing/scanning) | Integrate, don't build | Extensiv / ShipHero / Cin7 / Katana push movements IN via admin API |
| Forecasting / accounting valuation | Integrate | third-party; usually premature |

**Integration rule:** Medusa stays the source of truth for available-to-sell; external systems write movements in via workflows/admin API — never fork the truth.

## Default phase plan (single-warehouse, own staff)

1. Alerts + movement ledger (cheap, immediate value)
2. PO module — the actual "proper inventory management" deliverable
3. Transfers + stock takes — only if multi-location or periodic counts
4. Skip WMS/forecasting/lot-serial unless products or scale force them
