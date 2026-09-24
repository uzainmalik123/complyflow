"use server";

import { getInvoiceDetail } from "@/lib/db";

export async function getInvoiceDetailAction(invoiceId: string) {
  return getInvoiceDetail(invoiceId);
}