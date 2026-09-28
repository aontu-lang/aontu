export interface Customer {
  country: string;
  currency: string;
  id: string;
  ledgerId: number;
  name: string;
}

export interface Invoice {
  currency: string;
  grossCents: number;
  id: string;
  netCents: number;
  orderId: unknown;
  taxCents: number;
}

export interface Order {
  customerId: unknown;
  id: string;
  lines: unknown[];
  placed: string;
  status: string;
}

export interface OrderLine {
  amountCents: number;
  qty: number;
  sku: string;
  unitCents: number;
}
