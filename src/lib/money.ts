const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (cents: number) => BRL.format((cents || 0) / 100);
export const toCents = (value: string | number) => Math.round(Number(value || 0) * 100);
