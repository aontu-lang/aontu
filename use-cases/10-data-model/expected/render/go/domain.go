package domain

type Customer struct {
	Country string `json:"country"`
	Currency string `json:"currency"`
	ID string `json:"id"`
	LedgerID int64 `json:"ledgerId"`
	Name string `json:"name"`
}

type Invoice struct {
	Currency string `json:"currency"`
	GrossCents int64 `json:"grossCents"`
	ID string `json:"id"`
	NetCents int64 `json:"netCents"`
	OrderID any `json:"orderId"`
	TaxCents int64 `json:"taxCents"`
}

type Order struct {
	CustomerID any `json:"customerId"`
	ID string `json:"id"`
	Lines []OrderLine `json:"lines"`
	Placed *string `json:"placed,omitempty"`
	Status *string `json:"status,omitempty"`
}

type OrderLine struct {
	AmountCents int64 `json:"amountCents"`
	Qty int64 `json:"qty"`
	Sku string `json:"sku"`
	UnitCents int64 `json:"unitCents"`
}
