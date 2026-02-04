/**
 * Tests for cost calculator utility
 */

import { calculateCost } from '../utils/cost-calculator';

describe('calculateCost', () => {
	it('should return 0 for zero tokens', () => {
		expect(calculateCost(0, 0)).toBe(0);
	});

	it('should calculate input cost correctly', () => {
		// 1 million input tokens at $3/million = $3
		expect(calculateCost(1_000_000, 0)).toBe(3);
	});

	it('should calculate output cost correctly', () => {
		// 1 million output tokens at $15/million = $15
		expect(calculateCost(0, 1_000_000)).toBe(15);
	});

	it('should calculate combined cost correctly', () => {
		// 1M input ($3) + 1M output ($15) = $18
		expect(calculateCost(1_000_000, 1_000_000)).toBe(18);
	});

	it('should handle fractional token counts', () => {
		// 500K input ($1.50) + 200K output ($3) = $4.50
		expect(calculateCost(500_000, 200_000)).toBe(4.5);
	});

	it('should handle small token counts', () => {
		// 1000 input tokens = $0.003, 1000 output = $0.015 => $0.018
		const result = calculateCost(1000, 1000);
		expect(result).toBeCloseTo(0.018, 6);
	});
});
