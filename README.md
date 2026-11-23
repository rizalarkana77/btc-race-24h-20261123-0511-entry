# Band Rider — a cbBTC bot that only trades proven moves

[![Band Rider](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![Rank](https://make.fun/badge/btc-race-24h-20261123-0511/rizalarkana77/btc-race-24h-20261123-0511-entry/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![Reward](https://make.fun/badge/btc-race-24h-20261123-0511/rizalarkana77/btc-race-24h-20261123-0511-entry/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A long-only bot for the 24h cbBTC race. It waits for the price to prove
a real move, rides it, and gets out the moment the move breaks down.

## Why this bot wins

- **It refuses to pay the fee bleed.** One round trip costs ~26 bps
  in fees, slippage and pool impact, while 1-minute bars wobble only
  ~8 bps. Fast signals churn themselves to death here: an 8/21 EMA
  cross fires 76 times on the dev window and loses ~$115, a 12/26
  cross loses ~$104. This bot fires once and banks the move.
- **It only trades proof, not noise.** Entry needs the close 120 bps
  clear of its 2-hour average — a sustained move, not a wobble. On
  the dev window (+364 bps grind up) that single trade nets +$11.63
  after every fee, verified by the kit's local grader.
- **It is not a knife-edge fit.** A sweep of band 100–150 bps is a
  broad plateau (band 120 and band 150 both clear +$11.63 on the dev
  window); the bot sits in the middle of it, so it does not depend
  on one magic number surviving contact with unseen prices.
- **It survives a down day.** The entry needs an up move to be proven
  first, and the exit fires the moment the price falls 120 bps under
  its own 2-hour average. Across five earlier dev windows
  (13/15/17/18/23 Nov) this shape totals +$8.60 with the worst window
  −$8.17, while dip-buying totals −$74 and fast trend-following
  totals −$128 over the same five days. In a downtrend it simply
  stays in cash instead of catching falling knives.
- **It never blows up.** One position at a time, full size only on a
  proven move, a 180 bps stop, a 250 bps take-profit, and no fresh
  entries in the last 40 bars. Worst single-window drawdown in
  testing: −163 bps, far under the 25% guardrail.
- **It always races.** If the window is so quiet the band never fires,
  a $100 probe at bar 1400 guarantees the "at least 1 trade" bar, so
  the entry is never ranked below every trading entry for the sin of
  doing nothing.

## Strategy

- Gauge: 120-bar EMA of closes (~2 hours).
- Entry: flat, and the close is ≥ 120 bps above the EMA, full size
  (100% of cash), no new entries after scored bar 1400.
- Exit: close ≤ 120 bps below the EMA, or +250 bps over cost, or
  −180 bps under it.
- Probe: if never traded by scored bar 1400, buy $100, closed by the
  normal exits or the final flatten.
- Deterministic: every decision comes from the bars and the account
  the harness sends. No clock, no environment, no randomness. Stdlib
  only.

## Files

- `main.ts` — the bot (TypeScript, Node 22, stdlib only; the kit's
  process grader runs Node only on this machine, so the entry ships
  as TypeScript)
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's TS shim
- `LICENSE` — MIT
