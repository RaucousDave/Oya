import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  user: {
    merchants: r.one.merchants({
      from: r.user.id,
      to: r.merchants.userId,
    }),
  },
  merchants: {
    user: r.one.user({
      from: r.merchants.userId,
      to: r.user.id,
      optional: false,
    }),
    payments: r.many.payments({
      from: r.merchants.id,
      to: r.payments.merchantId,
    }),
  },
  payments: {
    chainTxs: r.many.chainTxs({
      from: r.payments.id,
      to: r.chainTxs.paymentId,
    }),
    ledgerEntries: r.many.ledgerEntries({
      from: r.payments.id,
      to: r.ledgerEntries.paymentId,
    }),
    payouts: r.one.payouts({
      from: r.payments.id,
      to: r.payouts.paymentId,
      optional: false,
    }),
    receipts: r.one.receipts({
      from: r.payments.id,
      to: r.receipts.paymentId,
    }),
    auditEvents: r.many.auditEvents({
      from: r.payments.id,
      to: r.auditEvents.paymentId,
    }),
  },
  chainTxs: {
    payments: r.one.payments({
      from: r.chainTxs.paymentId,
      to: r.payments.id,
      optional: false,
    }),
  },
  ledgerEntries: {
    payments: r.one.payments({
      from: r.ledgerEntries.paymentId,
      to: r.payments.id,
      optional: false,
    }),
  },
  payouts: {
    payments: r.one.payments({
      from: r.payouts.paymentId,
      to: r.payments.id,
      optional: false,
    }),
  },
  receipts: {
    payments: r.one.payments({
      from: r.receipts.paymentId,
      to: r.payments.id,
      optional: false,
    }),
  },

  auditEvents: {
    payments: r.one.payments({
      from: r.auditEvents.paymentId,
      to: r.payments.id,
      optional: false,
    }),
  },
}));

// merchants
//   └── payments                 one merchant → many payments
//         ├── chain_txs          one payment → many transfers
//         ├── ledger_entries     one payment → many financial events
//         ├── payouts            one payment → at most one payout
//         ├── receipts           one payment → at most one receipt
//         └── audit_events       one payment → many status changes
