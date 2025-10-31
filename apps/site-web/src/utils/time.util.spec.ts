import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeUtil } from './time.util';

describe('timeUtil', () => {
  describe('calculateTimeLeft', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should calculate time left correctly', () => {
      const now = new Date('2024-01-01T00:00:00Z');
      vi.setSystemTime(now);

      const targetDate = new Date('2024-01-02T12:30:45Z').toISOString();
      const result = timeUtil.calculateTimeLeft(targetDate);

      expect(result.days).toBe(1);
      expect(result.hours).toBe(12);
      expect(result.minutes).toBe(30);
      expect(result.seconds).toBe(45);
    });

    it('should return zeros when target date is in the past', () => {
      const now = new Date('2024-01-02T00:00:00Z');
      vi.setSystemTime(now);

      const targetDate = new Date('2024-01-01T00:00:00Z').toISOString();
      const result = timeUtil.calculateTimeLeft(targetDate);

      expect(result.days).toBe(0);
      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
      expect(result.seconds).toBe(0);
    });

    it('should handle exact time match', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const targetDate = now.toISOString();
      const result = timeUtil.calculateTimeLeft(targetDate);

      expect(result.days).toBe(0);
      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
      expect(result.seconds).toBe(0);
    });
  });

  describe('formatDuration', () => {
    it('should format duration correctly with minutes and seconds', () => {
      expect(timeUtil.formatDuration(125)).toBe('2m 5s');
    });

    it('should format duration correctly with only seconds', () => {
      expect(timeUtil.formatDuration(45)).toBe('0m 45s');
    });

    it('should format duration correctly with only minutes', () => {
      expect(timeUtil.formatDuration(120)).toBe('2m 0s');
    });

    it('should handle zero duration', () => {
      expect(timeUtil.formatDuration(0)).toBe('0m 0s');
    });

    it('should handle large durations', () => {
      expect(timeUtil.formatDuration(3665)).toBe('61m 5s');
    });
  });
});
