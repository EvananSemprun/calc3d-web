/** «1 compra» / «2 compras»: el número y la palabra que le corresponde, sin «(s)» a mano. */
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
