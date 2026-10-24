# Nessie API findings

Live behavior of Capital One's Nessie API (`https://api.nessieisreal.com`), measured against our key with `pnpm nessie:verify` on 2026-10-24. No keys appear in this file. The key is read from `NESSIE_API_KEY` in `.env.local` (git-ignored) and is redacted from all probe output.

Re-run the probe any time with `pnpm nessie:verify`. It creates throwaway records, prints PASS / FAIL / INFO with evidence, and deletes everything Nessie allows it to delete.

## Summary

| # | Question | Result |
|---|---|---|
| 1 | Does a write change the account's `balance`? | **No.** Transfers, withdrawals, deposits and purchases never move it: not immediately, not after 3 s, not after `PUT status=completed`. `PUT /accounts/{id}` only accepts `nickname`. |
| 2 | Can a transfer name its destination? | **No.** `POST /accounts/{id}/transfers` rejects `payee_id`, `medium` and `type` ("extra fields not permitted"). It accepts only `{amount, transaction_date, status, description}`, and `status` must be `pending` at creation. `PUT /transfers/{id} {status: completed}` works (202). |
| 3 | Transfer response shape | POST returns `objectCreated` with `_id`. `GET /transfers/{id}` returns `id`. |
| 4 | Are amounts truncated to whole dollars? | **Yes.** A 15.49 withdrawal is stored as 15, and a 7.25 deposit as 7. |
| 5 | Withdrawal / deposit `type` field | Withdrawals **reject** `type`. Deposits **accept it but don't require it** (the brief said required; that's wrong). |
| 6 | Which bill fields are needed at creation? | Send `payment_date` and `recurring_date`. Nessie fills in `creation_date` and `upcoming_payment_date` itself and **rejects them if you send them**. |
| 7 | Bill with no date fields | Accepted (201), but then `GET /accounts/{id}/bills` returns **400** for that whole account. Adding the dates later with PUT doesn't fix it, because `upcoming_payment_date` can't be set. **Deleting the bad bill fixes it**, so it's not permanent. |
| 8 | Can we update bills? | **Yes.** `PUT /bills/{id}` sets `status` (to completed and back to pending), `payee`, `nickname` and `payment_amount`. That makes a real Nessie bill field usable as an attack carrier. |
| 9 | Empty collections | Only **transfers** returns 404 (`"No transfers found for this account"`). Bills, withdrawals, deposits and purchases return `200 []`. |
| 10 | Which DELETEs work? | Deposits, transfers, bills and accounts: **200**. Withdrawals, purchases, merchants and customers: **403** (AWS "Missing Authentication Token", meaning the route doesn't exist). `GET` and `PUT /withdrawals/{id}` and `PUT /purchases/{id}` are also not routed; read withdrawals via `GET /accounts/{id}/withdrawals`. |
| 11 | Latency | 96 calls: **avg 116 ms**, p50 102 ms, p95 141 ms, max 818 ms (one PUT). Well under the 1 s target. |
| 12 | Rate limits | No 429s in 20 rapid sequential calls, and no rate-limit headers on any response. |
| 13 | Merchants | `POST /merchants` needs `category` as a string (not a list). Merchants are **global across keys** and can't be deleted. |

## Key behavior (from the first test)

- Any key string is accepted on reads: a fake key gets `200 []`. Only a write plus a read-back proves the key works.
- Data is scoped per key: another key gets 404 on our records, so the whole team shares one key.
- Ids are UUIDs. Never assume a format.

## What this means for NessieBackend

- **Ledger model.** The account balance never moves, so we compute it ourselves: opening balance minus this run's withdrawals plus this run's deposits, counting only records whose `description` starts with `tripwire:<runId>:`. Reset gets a new `runId`, so the balance snaps back to $3,200.
- **Money movement = withdrawal + deposit.** Transfers can't carry a payee, so `pay_bill` and `transfer` are a withdrawal from the user's account plus a deposit to the payee's account. That way the attacker's Nessie account visibly receives the money.
- **Exact cents.** Nessie truncates to whole dollars, so the description also carries the exact amount in cents, and the ledger reads it from there.
- **Cleanup.** Withdrawals can't be deleted, so old runs' withdrawals stay on the user's account forever. That's harmless because the ledger ignores other runs. Deposits can be deleted, so reset removes old-run deposits in the background.
- **Bills.** Create them with `payment_date` and `recurring_date` only. Reset PUTs them back to `pending`. The bill-field attack PUTs the injected text into a real bill's `payee`.
- **Lists.** Treat 404 on a list endpoint as `[]` (needed for transfers).

## Leftovers under our key

These can't be deleted through the API, and seed code must ignore them:
- Customer "Tripwire KeyTest" (`81d72797-…`), from the first key test.
- Two "Tripwire Probe" customers (`346b5be0-…`, `4d80c7b1-…`). They have no accounts left, and the probe reuses one on each run.
- One global merchant, "Tripwire Probe Merchant" (`2b65bda9-…`), reused by the probe for purchases.
- A few probe withdrawals and purchases that were attached to accounts the probe has since deleted.
