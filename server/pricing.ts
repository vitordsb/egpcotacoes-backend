/**
 * Helpers para cálculos de preço, conversão de moeda e impostos
 */

/**
 * Busca a taxa PTAX atual do Banco Central
 * Retorna a taxa de câmbio USD/BRL
 */
export async function getPTAXRate(): Promise<number> {
  try {
    // API do Banco Central do Brasil para taxa PTAX
    const response = await fetch(
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json'
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch PTAX rate');
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      // O valor está em formato "valor" no primeiro elemento
      const rate = parseFloat(data[0].valor);
      return rate;
    }
    
    throw new Error('Invalid PTAX response format');
  } catch (error) {
    console.error('Error fetching PTAX rate:', error);
    // Fallback para uma taxa aproximada caso a API falhe
    // Esta é apenas uma taxa de exemplo, em produção você pode querer usar um cache ou valor padrão
    return 5.0;
  }
}

/**
 * Converte valor em dólar para real usando a taxa PTAX
 */
export function convertDollarToReal(dollarAmount: number, exchangeRate: number): number {
  return dollarAmount * exchangeRate;
}

/**
 * Calcula o valor do IPI
 */
export function calculateIPI(basePrice: number, ipiPercentage: number): number {
  if (!ipiPercentage || ipiPercentage === 0) return 0;
  return basePrice * (ipiPercentage / 100);
}

/**
 * Calcula o valor do ICMS
 */
export function calculateICMS(basePrice: number, icmsPercentage: number): number {
  if (!icmsPercentage || icmsPercentage === 0) return 0;
  return basePrice * (icmsPercentage / 100);
}

/**
 * Calcula o preço final incluindo IPI e ICMS
 * 
 * @param basePrice - Preço base (em Real)
 * @param ipiPercentage - Percentual de IPI (opcional)
 * @param icmsPercentage - Percentual de ICMS (opcional)
 * @returns Preço final
 */
export function calculateFinalPrice(
  basePrice: number,
  ipiPercentage?: number,
  icmsPercentage?: number
): number {
  let finalPrice = basePrice;
  
  if (ipiPercentage && ipiPercentage > 0) {
    finalPrice += calculateIPI(basePrice, ipiPercentage);
  }
  
  if (icmsPercentage && icmsPercentage > 0) {
    finalPrice += calculateICMS(basePrice, icmsPercentage);
  }
  
  return finalPrice;
}

/**
 * Processa o preço de um item de cotação
 * Retorna o preço final em Real com IPI e ICMS aplicados
 */
export async function processPriceQuote(
  priceInReal?: number,
  priceInDollar?: number,
  ipiPercentage?: number,
  icmsPercentage?: number
): Promise<{
  basePrice: number;
  exchangeRate: number;
  ipiAmount: number;
  icmsAmount: number;
  finalPrice: number;
}> {
  // Validação: pelo menos um valor deve ser fornecido
  if (!priceInReal && !priceInDollar) {
    throw new Error('Either priceInReal or priceInDollar must be provided');
  }

  let basePrice = priceInReal || 0;
  let exchangeRate = 1;

  // Se apenas dólar foi fornecido, converte para real
  if (!priceInReal && priceInDollar) {
    exchangeRate = await getPTAXRate();
    basePrice = convertDollarToReal(priceInDollar, exchangeRate);
  }

  // Se ambos foram fornecidos, usa o valor em real (dólar é ignorado)
  // Calcula os impostos
  const ipiAmount = calculateIPI(basePrice, ipiPercentage || 0);
  const icmsAmount = calculateICMS(basePrice, icmsPercentage || 0);
  const finalPrice = basePrice + ipiAmount + icmsAmount;

  return {
    basePrice,
    exchangeRate,
    ipiAmount,
    icmsAmount,
    finalPrice,
  };
}

/**
 * Encontra o fornecedor com o melhor preço para um item
 */
export function findLowestPriceSupplier(
  quotes: Array<{ supplierId: number; finalPrice: number; supplierName?: string }>
): { supplierId: number; finalPrice: number; supplierName?: string } | null {
  if (quotes.length === 0) return null;
  
  return quotes.reduce((lowest, current) => {
    return current.finalPrice < lowest.finalPrice ? current : lowest;
  });
}

/**
 * Verifica se o preço bateu o target de compra
 */
export function meetsTargetPrice(finalPrice: number, targetPrice: number | null | undefined): boolean {
  if (!targetPrice) return false;
  return finalPrice <= targetPrice;
}
