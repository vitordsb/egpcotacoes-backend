import { describe, it, expect } from "vitest";
import {
  calculateFinalPrice,
  calculateIPI,
  calculateICMS,
  convertDollarToReal,
  meetsTargetPrice,
  findLowestPriceSupplier,
  processPriceQuote,
} from "./pricing";

describe("Pricing Helpers", () => {
  describe("calculateIPI", () => {
    it("should calculate IPI correctly", () => {
      const result = calculateIPI(100, 10);
      expect(result).toBe(10);
    });

    it("should return 0 for zero percentage", () => {
      const result = calculateIPI(100, 0);
      expect(result).toBe(0);
    });

    it("should return 0 for undefined percentage", () => {
      const result = calculateIPI(100, undefined as any);
      expect(result).toBe(0);
    });
  });

  describe("calculateICMS", () => {
    it("should calculate ICMS correctly", () => {
      const result = calculateICMS(100, 18);
      expect(result).toBe(18);
    });

    it("should return 0 for zero percentage", () => {
      const result = calculateICMS(100, 0);
      expect(result).toBe(0);
    });
  });

  describe("calculateFinalPrice", () => {
    it("should calculate final price with IPI only", () => {
      const result = calculateFinalPrice(100, 10, 0);
      expect(result).toBe(110);
    });

    it("should calculate final price with ICMS only", () => {
      const result = calculateFinalPrice(100, 0, 18);
      expect(result).toBe(118);
    });

    it("should calculate final price with both IPI and ICMS", () => {
      const result = calculateFinalPrice(100, 10, 18);
      expect(result).toBe(128);
    });

    it("should return base price when no taxes", () => {
      const result = calculateFinalPrice(100, 0, 0);
      expect(result).toBe(100);
    });

    it("should handle undefined taxes", () => {
      const result = calculateFinalPrice(100);
      expect(result).toBe(100);
    });
  });

  describe("convertDollarToReal", () => {
    it("should convert dollar to real correctly", () => {
      const result = convertDollarToReal(100, 5.0);
      expect(result).toBe(500);
    });

    it("should handle decimal exchange rates", () => {
      const result = convertDollarToReal(100, 5.25);
      expect(result).toBe(525);
    });
  });

  describe("meetsTargetPrice", () => {
    it("should return true when price meets target", () => {
      const result = meetsTargetPrice(100, 150);
      expect(result).toBe(true);
    });

    it("should return false when price exceeds target", () => {
      const result = meetsTargetPrice(200, 150);
      expect(result).toBe(false);
    });

    it("should return false when target is null", () => {
      const result = meetsTargetPrice(100, null);
      expect(result).toBe(false);
    });

    it("should return false when target is undefined", () => {
      const result = meetsTargetPrice(100, undefined);
      expect(result).toBe(false);
    });
  });

  describe("findLowestPriceSupplier", () => {
    it("should find supplier with lowest price", () => {
      const quotes = [
        { supplierId: 1, finalPrice: 100 },
        { supplierId: 2, finalPrice: 80 },
        { supplierId: 3, finalPrice: 120 },
      ];
      const result = findLowestPriceSupplier(quotes);
      expect(result?.supplierId).toBe(2);
      expect(result?.finalPrice).toBe(80);
    });

    it("should return null for empty array", () => {
      const result = findLowestPriceSupplier([]);
      expect(result).toBeNull();
    });

    it("should handle single supplier", () => {
      const quotes = [{ supplierId: 1, finalPrice: 100 }];
      const result = findLowestPriceSupplier(quotes);
      expect(result?.supplierId).toBe(1);
    });
  });

  describe("processPriceQuote", () => {

    it("should throw error when no price provided", async () => {
      // @ts-ignore - Testing error case
      await expect(processPriceQuote()).rejects.toThrow(
        "Either priceInReal or priceInDollar must be provided"
      );
    });

    it("should process price in real only", async () => {
      const result = await processPriceQuote(100, undefined, 10, 18);
      expect(result.basePrice).toBe(100);
      // Quando apenas preço em real é fornecido, exchangeRate é 1
      expect(result.ipiAmount).toBe(10);
      expect(result.icmsAmount).toBe(18);
      expect(result.finalPrice).toBe(128);
    });

    it("should process price in dollar only", async () => {
      const result = await processPriceQuote(undefined, 100, 10, 18);
      // A taxa PTAX real é obtida da API, então apenas verificamos que foi convertida
      expect(result.basePrice).toBeGreaterThan(0);
      expect(result.exchangeRate).toBeGreaterThan(0);
      expect(result.ipiAmount).toBeGreaterThan(0);
      expect(result.icmsAmount).toBeGreaterThan(0);
      expect(result.finalPrice).toBeGreaterThan(result.basePrice);
    });

    it("should prioritize real price when both provided", async () => {
      const result = await processPriceQuote(100, 200, 10, 18);
      expect(result.basePrice).toBe(100);
      expect(result.finalPrice).toBe(128); // 100 + 10 + 18
    });
  });
});
