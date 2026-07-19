import "server-only";

import Stripe from "stripe";

// 環境変数の遅延評価。import 時に sk_ を読まないので、build 時に空でも落ちない。
function getSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === "sk_test_REPLACE_ME") {
    throw new Error(
      "STRIPE_SECRET_KEY が設定されていません。.env.local を確認してください。",
    );
  }
  return key;
}

let _stripe: Stripe | null = null;

// 都度 new せず、最初の呼び出しでだけ SDK を初期化する。
// apiVersion は SDK のビルトイン型に同期させるため明示指定はしない（latest を使う）。
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(getSecretKey(), {
    typescript: true,
    // appInfo を入れると Stripe ダッシュボードのリクエストログで識別しやすい。
    appInfo: { name: "HIIRAGI", version: "0.1.0" },
  });
  return _stripe;
}

export const STRIPE_PRICE_BASIC = process.env.STRIPE_PRICE_BASIC ?? "";
export const STRIPE_PRICE_MYPAGE = process.env.STRIPE_PRICE_MYPAGE ?? "";

// subscription がどの商品のものかを price 構成から判定する。
//   マイページオプションは基本プランとは「別の subscription」として管理するため、
//   1つの subscription には base か mypage のどちらか一方の price しか入らない前提。
export type StripeProductKind = "base" | "mypage" | "unknown";

export function classifyPriceIds(priceIds: Iterable<string>): StripeProductKind {
  const set = new Set(priceIds);
  if (STRIPE_PRICE_MYPAGE && set.has(STRIPE_PRICE_MYPAGE)) return "mypage";
  if (STRIPE_PRICE_BASIC && set.has(STRIPE_PRICE_BASIC)) return "base";
  return "unknown";
}
