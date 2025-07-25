import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encodeUrlSafeBase64, decodeUrlSafeBase64 } from '../src/blob';

describe('encodeUrlSafeBase64', () => {
  describe('Node.js environment', () => {
    it('should encode a simple string', () => {
      const input = 'Hello, World!';
      const encoded = encodeUrlSafeBase64(input);
      
      expect(encoded).toBe('SGVsbG8sIFdvcmxkIQ');
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should encode JSON strings', () => {
      const json = JSON.stringify({ name: 'Test', value: 123 });
      const encoded = encodeUrlSafeBase64(json);
      
      expect(encoded).toBeTruthy();
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should handle strings that would normally have + in base64', () => {
      // Use a character that produces + in standard base64
      const input = String.fromCharCode(2110); // Produces '4KC+' in standard base64
      const encoded = encodeUrlSafeBase64(input);
      
      expect(encoded).not.toContain('+');
      expect(encoded).toContain('-'); // + should be replaced with -
      expect(encoded).toBe('4KC-'); // Verify exact output
    });

    it('should handle strings that would normally have / in base64', () => {
      // Use a character that produces / in standard base64
      const input = String.fromCharCode(2111); // Produces '4KC/' in standard base64
      const encoded = encodeUrlSafeBase64(input);
      
      expect(encoded).not.toContain('/');
      expect(encoded).toContain('_'); // / should be replaced with _
      expect(encoded).toBe('4KC_'); // Verify exact output
    });

    it('should strip padding characters', () => {
      // These inputs typically require padding in standard base64
      const inputs = ['a', 'ab', 'abc', 'abcd', 'abcde'];
      
      inputs.forEach(input => {
        const encoded = encodeUrlSafeBase64(input);
        expect(encoded).not.toContain('=');
      });
    });

    it('should handle unicode characters', () => {
      const input = '🎉 ñ ü ö €';
      const encoded = encodeUrlSafeBase64(input);
      
      expect(encoded).toBeTruthy();
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should handle empty strings', () => {
      const encoded = encodeUrlSafeBase64('');
      expect(encoded).toBe('');
    });
  });

  describe('Browser environment', () => {
    let originalBuffer: any;

    beforeEach(() => {
      // Mock browser environment by removing Buffer
      originalBuffer = (globalThis as any).Buffer;
      (globalThis as any).Buffer = undefined;
    });

    afterEach(() => {
      // Restore Buffer
      (globalThis as any).Buffer = originalBuffer;
    });

    it('should encode using btoa in browser environment', () => {
      const input = 'Hello, Browser!';
      const encoded = encodeUrlSafeBase64(input);
      
      expect(encoded).toBe('SGVsbG8sIEJyb3dzZXIh');
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should handle unicode in browser environment', () => {
      const input = '🎉 Unicode test';
      const encoded = encodeUrlSafeBase64(input);
      
      expect(encoded).toBeTruthy();
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should produce same output as Node environment', () => {
      const testCases = [
        'Simple text',
        JSON.stringify({ test: true }),
        '🎉 ñ ü ö €',
        'Text with\nnewlines\tand\ttabs',
        ''
      ];

      testCases.forEach(input => {
        // Encode in browser mode
        const browserEncoded = encodeUrlSafeBase64(input);
        
        // Restore Buffer temporarily to encode in Node mode
        (globalThis as any).Buffer = originalBuffer;
        const nodeEncoded = encodeUrlSafeBase64(input);
        (globalThis as any).Buffer = undefined;
        
        expect(browserEncoded).toBe(nodeEncoded);
      });
    });
  });
});

describe('decodeUrlSafeBase64', () => {
  describe('Node.js environment', () => {
    it('should decode a simple string', () => {
      const encoded = 'SGVsbG8sIFdvcmxkIQ';
      const decoded = decodeUrlSafeBase64(encoded);
      
      expect(decoded).toBe('Hello, World!');
    });

    it('should decode strings with URL-safe replacements', () => {
      // Test string with - (originally +)
      const withDash = 'SGVsbG8-IFdvcmxkIQ';
      expect(() => decodeUrlSafeBase64(withDash)).not.toThrow();
      
      // Test string with _ (originally /)
      const withUnderscore = 'SGVsbG8_IFdvcmxkIQ';
      expect(() => decodeUrlSafeBase64(withUnderscore)).not.toThrow();
    });

    it('should handle missing padding', () => {
      // These are valid base64url strings without padding
      const withoutPadding = [
        'YQ', // 'a' encoded
        'YWI', // 'ab' encoded
        'YWJj', // 'abc' encoded
      ];
      
      withoutPadding.forEach(encoded => {
        expect(() => decodeUrlSafeBase64(encoded)).not.toThrow();
      });
    });

    it('should decode unicode correctly', () => {
      const encoded = encodeUrlSafeBase64('🎉 ñ ü ö €');
      const decoded = decodeUrlSafeBase64(encoded);
      
      expect(decoded).toBe('🎉 ñ ü ö €');
    });

    it('should handle empty strings', () => {
      const decoded = decodeUrlSafeBase64('');
      expect(decoded).toBe('');
    });

    it('should handle invalid base64', () => {
      // Node's Buffer.from silently ignores invalid base64 characters
      // So our implementation returns empty string for completely invalid input
      const result = decodeUrlSafeBase64('!@#$%');
      expect(result).toBe('');
    });
  });

  describe('Browser environment', () => {
    let originalBuffer: any;

    beforeEach(() => {
      // Mock browser environment by removing Buffer
      originalBuffer = (globalThis as any).Buffer;
      (globalThis as any).Buffer = undefined;
    });

    afterEach(() => {
      // Restore Buffer
      (globalThis as any).Buffer = originalBuffer;
    });

    it('should decode using atob in browser environment', () => {
      const encoded = 'SGVsbG8sIEJyb3dzZXIh';
      const decoded = decodeUrlSafeBase64(encoded);
      
      expect(decoded).toBe('Hello, Browser!');
    });

    it('should handle URL-safe characters in browser', () => {
      const encoded = encodeUrlSafeBase64('Test+/=');
      const decoded = decodeUrlSafeBase64(encoded);
      
      expect(decoded).toBe('Test+/=');
    });

    it('should decode unicode in browser environment', () => {
      const original = '🎉 Unicode test';
      const encoded = encodeUrlSafeBase64(original);
      const decoded = decodeUrlSafeBase64(encoded);
      
      expect(decoded).toBe(original);
    });

    it('should produce same output as Node environment', () => {
      const testCases = [
        { encoded: 'SGVsbG8sIFdvcmxkIQ', expected: 'Hello, World!' },
        { encoded: 'YQ', expected: 'a' },
        { encoded: 'YWI', expected: 'ab' },
        { encoded: 'YWJj', expected: 'abc' },
      ];

      testCases.forEach(({ encoded, expected }) => {
        // Decode in browser mode
        const browserDecoded = decodeUrlSafeBase64(encoded);
        
        // Restore Buffer temporarily to decode in Node mode
        (globalThis as any).Buffer = originalBuffer;
        const nodeDecoded = decodeUrlSafeBase64(encoded);
        (globalThis as any).Buffer = undefined;
        
        expect(browserDecoded).toBe(expected);
        expect(browserDecoded).toBe(nodeDecoded);
      });
    });

    it('should handle empty string in browser', () => {
      const decoded = decodeUrlSafeBase64('');
      expect(decoded).toBe('');
    });
  });

  describe('Roundtrip encoding/decoding', () => {
    const testCases = [
      'Simple ASCII text',
      'Text with special chars: !@#$%^&*()',
      '{"json": true, "nested": {"value": 123}}',
      '🎉 Unicode: ñ ü ö € 中文 日本語',
      'Multi\nline\ntext\twith\ttabs',
      'a', // Short string that needs padding
      '', // Empty string
      Array(1000).fill('x').join(''), // Long string
    ];

    it('should roundtrip correctly in Node environment', () => {
      testCases.forEach(original => {
        const encoded = encodeUrlSafeBase64(original);
        const decoded = decodeUrlSafeBase64(encoded);
        expect(decoded).toBe(original);
      });
    });

    it('should roundtrip correctly in browser environment', () => {
      const originalBuffer = (globalThis as any).Buffer;
      (globalThis as any).Buffer = undefined;

      try {
        testCases.forEach(original => {
          const encoded = encodeUrlSafeBase64(original);
          const decoded = decodeUrlSafeBase64(encoded);
          expect(decoded).toBe(original);
        });
      } finally {
        (globalThis as any).Buffer = originalBuffer;
      }
    });

    it('should produce identical results across environments', () => {
      const originalBuffer = (globalThis as any).Buffer;

      testCases.forEach(original => {
        // Encode in Node
        const nodeEncoded = encodeUrlSafeBase64(original);
        
        // Encode in Browser
        (globalThis as any).Buffer = undefined;
        const browserEncoded = encodeUrlSafeBase64(original);
        (globalThis as any).Buffer = originalBuffer;
        
        // Both should be identical
        expect(browserEncoded).toBe(nodeEncoded);
        
        // Both should decode to original
        expect(decodeUrlSafeBase64(nodeEncoded)).toBe(original);
        expect(decodeUrlSafeBase64(browserEncoded)).toBe(original);
      });
    });
  });
});