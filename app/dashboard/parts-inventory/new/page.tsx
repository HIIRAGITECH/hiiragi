import type { Metadata } from "next";
import Link from "next/link";
import PartForm from "../part-form";
import { createPart } from "../actions";

export const metadata: Metadata = {
  title: "部品在庫 新規登録 | HIIRAGI",
};

export default function NewPartPage() {
  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/parts-inventory" className="hover:underline">
              部品在庫
            </Link>{" "}
            ／ 新規登録
          </div>
          <h1>部品を新規登録</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl">
          <PartForm
            action={createPart}
            submitLabel="登録する"
            cancelHref="/dashboard/parts-inventory"
          />
        </div>
      </div>
    </>
  );
}
