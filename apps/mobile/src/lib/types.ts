export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  sellUnit: string;
  requiresPrescription: boolean;
  batchTrackingRequired: boolean;
  indicativePrice: number;
  available: boolean;
  stock: number;
};

export type CatalogResponse = {
  items: Product[];
  categories: string[];
};
