import { apiFetch } from './api';
import { FlashSaleShape } from '@flash-sale/shared-types';

export async function listFlashSales() {
  return apiFetch<{ items: FlashSaleShape[]; total: number }>(`/flash-sales`);
}

export async function getFlashSale(id: string) {
  return apiFetch<FlashSaleShape>(`/flash-sales/${id}`);
}

export async function createFlashSale(data: FlashSaleShape) {
  return apiFetch<{ id: string }>(`/flash-sales`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFlashSale(id: any, data: Partial<FlashSaleShape>) {
  return apiFetch<{ updated: number }>(`/flash-sales/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteFlashSale(id: any) {
  return apiFetch<{ deleted: number }>(`/flash-sales/${id}`, {
    method: 'DELETE',
  });
}
