export const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`; // visible queue
export const holdKey = (flashSaleId: string, email: string) =>
  `fsh:${flashSaleId}:${email}`;
export const consumedKey = (saleId: string, email: string) =>
  `fshp:${saleId}:${email}`;
