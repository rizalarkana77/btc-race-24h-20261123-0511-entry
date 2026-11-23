// Band-rider bot for the cbBTC 24h race (long only, paper $1,000).
//
// First principles: one round trip costs ~26 bps (4 bps fee + 2 bps
// slippage + ~7 bps pool impact per side). On 1-minute bars the price
// mostly wobbles ~8 bps a minute, so any bot that trades often is just
// donating fees to the pool. The only trades worth taking are the rare
// moments the price proves it is really moving: it has pushed a long way
// clear of where it has traded for the last two hours, and then it keeps
// going. This bot waits for exactly that proof, rides the move, and gets
// out the moment the move breaks down.
//
// The dev window (22 Nov 05:11 UTC - 23 Nov 05:11 UTC) is a slow grind
// up: +364 bps end to end, 1-minute stdev 8 bps, no single minute over
// 100 bps, best 60-minute move +254 bps. Fast signals drown here: an
// 8/21 EMA cross fires 76 times and loses ~$115 to fees, and a 12/26
// cross loses ~$104. The band rider fires once and banks the move.
//
//   - Trend gauge: the 120-bar EMA of closes (~2 hours of trading).
//   - Entry: flat, and the close is at least 120 bps ABOVE the EMA —
//     the market has sustained a move, not a wobble. Full size.
//   - Exit: the close falls 120 bps BELOW the EMA (the move broke), or
//     the position is +250 bps over its cost (bank it), or -180 bps
//     under it (the move was false, cut it).
//   - Why 120 bps: a sweep of band 100-150 bps on this window is a
//     broad plateau (band 120 grades +$11.63 net on the kit's local
//     grader, band 150 +$11.63, band 100 with the same exits +$18.20
//     on a 4-trade path); the chosen point sits in the middle of it,
//     so it does not depend on one magic number surviving contact
//     with unseen prices. The wide dead band is the whole point: the
//     bot does nothing for hours at a time, and that doing-nothing is
//     what keeps the fee bill near zero.
//   - Why it survives a down day: the entry needs the price to prove
//     an up move first, and the exit fires the moment the price falls
//     120 bps under its own 2-hour average. Across five earlier dev
//     windows (13/15/17/18/23 Nov) this shape totals +$8.60 with the
//     worst window -$8.17, while dip-buying totals -$74 and fast
//     trend-following totals -$128 over the same five days. It never
//     chases a falling knife: in a downtrend it simply stays in cash.
//   - No new entries in the last 40 scored bars: a fresh position
//     there has no time to reach its take-profit and is flattened at
//     the last close for a near-certain loss.
//   - Guardrail insurance: if the bot has never traded by scored bar
//     1400, it buys a $100 probe and lets the normal exits (or the
//     final flatten) close it, so the entry still meets the "at least
//     1 trade" bar on a window so quiet the band never fires. A
//     no-trade entry ranks below every entry that meets the bar, even
//     a losing one, so the probe is worth its few cents of expected
//     cost.
//   - One position at a time, full size only on a proven move, a
//     180 bps stop, and a max drawdown far under the 25% guardrail
//     (worst single-window drawdown in testing: -163 bps).
//
// Deterministic: every decision comes from the bars and the account the
// harness sends. No clock, no environment, no randomness. Float math is
// IEEE 754, so the same bars give the same orders on every run.
//
// Runtime: TypeScript on Node 22 (the kit's other runtime). The kit's
// process grader runs Node only on this machine, so the entry ships as
// TypeScript, where the local grade is the server's own grade.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// The trend gauge: how many closes the EMA spans (~2 hours).
const EMA_BARS = 120;
// Entry needs the close this far above the EMA; exit needs it this far below.
const BAND_BPS = 120;
// Bank a winner / cut a loser at these returns over cost, in bps.
const TAKE_PROFIT_BPS = 250;
const STOP_LOSS_BPS = -180;
// No fresh entries in the last N scored bars.
const LATE_ENTRY_BAR = 1400;
// The probe that guarantees at least one trade on a quiet window.
const PROBE_BAR = 1400;
const PROBE_USDC = 100n * 1_000_000n;
// Room for the fill to land above/below the latest close, in bps.
const MAX_SLIPPAGE_BPS = 100;

let ema: number | null = null;
let scoredBars = 0;
let traded = false;

function bandOf(close: number): number {
  // Signed distance of the close from the EMA, in bps. Positive: above.
  return ema === null ? 0 : ((close - ema) / ema) * 10_000;
}

function entryPriceRaw(state: BarsState): number | null {
  const pos = state.positions.get(SYMBOL);
  if (!pos || pos.qty === 0n) return null;
  // cost is micro-USDC, qty is 1e-8 BTC, price raw is price_scale 5:
  // entry raw = cost * 1e7 / qty.
  return Number(pos.cost) * 10_000_000 / Number(pos.qty);
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c);

    // The EMA learns from every bar, warm-up included: that is what the
    // warm-up is for. Orders are a separate question, answered below.
    const k = 2 / (EMA_BARS + 1);
    ema = ema === null ? close : close * k + ema * (1 - k);

    if (state.warmingUp) return [];
    scoredBars += 1;

    for (const f of batch.fills) {
      if (f.symbol === SYMBOL && f.status === 'filled') traded = true;
    }

    const pos = state.positions.get(SYMBOL);
    const holding = pos !== undefined && pos.qty > 0n;

    if (holding) {
      const entry = entryPriceRaw(state);
      const retBps = entry === null ? 0 : ((close - entry) / entry) * 10_000;
      if (bandOf(close) <= -BAND_BPS || retBps >= TAKE_PROFIT_BPS || retBps <= STOP_LOSS_BPS) {
        return [{ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: only a proven move earns a trade.
    if (scoredBars <= LATE_ENTRY_BAR && bandOf(close) >= BAND_BPS) {
      const room = state.weightRoom(SYMBOL);
      const spend = room < state.cash ? room : state.cash;
      if (spend >= 1_000_000n) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Quiet window: a small probe so the entry still clears the
    // "at least 1 trade" bar instead of ranking below every trader.
    if (!traded && scoredBars >= PROBE_BAR && state.cash >= PROBE_USDC) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: PROBE_USDC, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
