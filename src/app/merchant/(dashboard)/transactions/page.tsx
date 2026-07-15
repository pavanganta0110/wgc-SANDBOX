import { redirect } from "next/navigation";

export default function TransactionsIndexPage() {
  redirect("/merchant/transactions/payments");
}
