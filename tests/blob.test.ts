import { describe, it, expect } from 'vitest';
import { createHydrationBlob, decodeHydrationBlob } from '../src/index';

describe('createHydrationBlob', () => {
  it('should handle Unicode characters correctly', () => {
    // Arrange
    const testData = {
      user: {
        name: '山田太郎 🎌',
        email: 'user@例え.jp',
        bio: 'Hello 世界! 🌍 Emoji: 😀👍'
      },
      settings: {
        locale: '日本語',
        currency: '€uro'
      }
    };

    // Act
    const blob = createHydrationBlob(testData);
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(decoded).toEqual(testData);
    expect(decoded.user.name).toBe('山田太郎 🎌');
    expect(decoded.user.bio).toBe('Hello 世界! 🌍 Emoji: 😀👍');
    expect(decoded.settings.locale).toBe('日本語');
  });

  it('should encode a simple object to a URL-safe base64 string', () => {
    // Arrange
    const testData = {
      user: {
        name: 'John Doe',
        age: 30,
        active: true
      },
      settings: {
        theme: 'dark',
        notifications: false
      }
    };

    // Act
    const blob = createHydrationBlob(testData);

    // Assert
    expect(typeof blob).toBe('string');
    expect(blob).not.toContain('+');
    expect(blob).not.toContain('/');
    expect(blob).not.toContain('=');
    
    // Should be able to decode back to original data
    const decoded = JSON.parse(Buffer.from(blob, 'base64url').toString('utf-8'));
    expect(decoded).toEqual(testData);
  });

  it('should handle empty objects', () => {
    // Arrange
    const emptyData = {};

    // Act
    const blob = createHydrationBlob(emptyData);

    // Assert
    expect(typeof blob).toBe('string');
    expect(blob.length).toBeGreaterThan(0);
    
    const decoded = JSON.parse(Buffer.from(blob, 'base64url').toString('utf-8'));
    expect(decoded).toEqual(emptyData);
  });

  it('should handle complex nested structures', () => {
    // Arrange
    const complexData = {
      level1: {
        level2: {
          level3: {
            value: 'deep',
            array: [1, 2, 3],
            boolean: false
          }
        },
        nullValue: null,
        undefinedValue: undefined
      }
    };

    // Act
    const blob = createHydrationBlob(complexData);

    // Assert
    const decoded = JSON.parse(Buffer.from(blob, 'base64url').toString('utf-8'));
    expect(decoded).toEqual({
      level1: {
        level2: {
          level3: {
            value: 'deep',
            array: [1, 2, 3],
            boolean: false
          }
        },
        nullValue: null
        // undefined values are not preserved in JSON
      }
    });
  });

  it('should handle arrays at root level', () => {
    // Arrange
    const arrayData = [1, 2, 3, 'four', { five: 5 }, [6, 7]];

    // Act
    // @ts-expect-error - Testing edge case with array instead of object
    const blob = createHydrationBlob(arrayData);

    // Assert
    const decoded = JSON.parse(Buffer.from(blob, 'base64url').toString('utf-8'));
    expect(decoded).toEqual(arrayData);
  });

  it('should handle special characters in strings', () => {
    // Arrange
    const specialCharsData = {
      unicode: '🎉 ñ ü ö €',
      escapes: 'Line 1\nLine 2\tTabbed',
      quotes: 'He said "Hello" and she said \'Hi\'',
      backslash: 'C:\\Users\\test\\file.txt',
      html: '<div class="test">&nbsp;</div>'
    };

    // Act
    const blob = createHydrationBlob(specialCharsData);

    // Assert
    expect(blob).not.toContain('+');
    expect(blob).not.toContain('/');
    expect(blob).not.toContain('=');
    
    const decoded = JSON.parse(Buffer.from(blob, 'base64url').toString('utf-8'));
    expect(decoded).toEqual(specialCharsData);
  });

  it('should handle large payloads', () => {
    // Arrange
    const largeData: Record<string, unknown> = {};
    // Create a payload with 1000 properties
    for (let i = 0; i < 1000; i++) {
      largeData[`property_${i}`] = {
        id: i,
        name: `Item ${i}`,
        description: `This is a longer description for item number ${i} to add more content`,
        tags: ['tag1', 'tag2', 'tag3'],
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          version: '1.0.0'
        }
      };
    }

    // Act
    const blob = createHydrationBlob(largeData);

    // Assert
    expect(blob.length).toBeGreaterThan(10000); // Should be a large string
    expect(blob).not.toContain('+');
    expect(blob).not.toContain('/');
    expect(blob).not.toContain('=');
    
    const decoded = JSON.parse(Buffer.from(blob, 'base64url').toString('utf-8'));
    expect(Object.keys(decoded).length).toBe(1000);
    expect(decoded.property_0).toEqual(largeData.property_0);
    expect(decoded.property_999).toEqual(largeData.property_999);
  });
});

describe('decodeHydrationBlob', () => {
  it('should decode a blob back to the original object', () => {
    // Arrange
    const originalData = {
      user: {
        name: 'Jane Smith',
        age: 25,
        active: false
      },
      config: {
        theme: 'light',
        language: 'en'
      }
    };
    const blob = createHydrationBlob(originalData);

    // Act
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(decoded).toEqual(originalData);
  });

  it('should decode blobs containing arrays', () => {
    // Arrange
    const arrayData = [1, 'two', { three: 3 }, [4, 5]];
    const blob = createHydrationBlob(arrayData);

    // Act
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(decoded).toEqual(arrayData);
  });

  it('should decode blobs with special characters', () => {
    // Arrange
    const specialData = {
      unicode: '🎉 ñ ü ö €',
      escapes: 'Line 1\nLine 2\tTabbed',
      quotes: 'He said "Hello" and she said \'Hi\'',
      backslash: 'C:\\Users\\test\\file.txt'
    };
    const blob = createHydrationBlob(specialData);

    // Act
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(decoded).toEqual(specialData);
  });

  it('should handle empty objects', () => {
    // Arrange
    const emptyData = {};
    const blob = createHydrationBlob(emptyData);

    // Act
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(decoded).toEqual(emptyData);
  });

  it('should preserve null values', () => {
    // Arrange
    const dataWithNull = {
      value: null,
      nested: {
        alsoNull: null,
        notNull: 'value'
      }
    };
    const blob = createHydrationBlob(dataWithNull);

    // Act
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(decoded).toEqual(dataWithNull);
  });

  it('should throw an error for invalid base64', () => {
    // Arrange
    const invalidBase64 = 'This is not valid base64!@#$%';

    // Act & Assert
    expect(() => decodeHydrationBlob(invalidBase64)).toThrow();
  });

  it('should throw an error for malformed JSON', () => {
    // Arrange
    // Create a valid base64 that contains invalid JSON
    const invalidJson = Buffer.from('{invalid json', 'utf-8').toString('base64url');

    // Act & Assert
    expect(() => decodeHydrationBlob(invalidJson)).toThrow();
  });

  it('should throw an error for non-string input', () => {
    // Arrange
    const nonStringInputs = [
      123,
      null,
      undefined,
      { object: true },
      ['array'],
      true,
      Symbol('test')
    ];

    // Act & Assert
    nonStringInputs.forEach(input => {
      // @ts-expect-error - Testing invalid input types
      expect(() => decodeHydrationBlob(input)).toThrow();
    });
  });

  it('should handle empty string gracefully', () => {
    // Arrange
    const emptyString = '';

    // Act & Assert
    // Empty string is technically valid base64url (decodes to empty buffer)
    // But parsing empty string as JSON should throw
    expect(() => decodeHydrationBlob(emptyString)).toThrow();
  });

  it('should decode very large payloads', () => {
    // Arrange
    const largeData: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) {
      largeData[`key_${i}`] = {
        value: `Value number ${i}`,
        timestamp: new Date().toISOString(),
        metadata: { index: i, type: 'large-test' }
      };
    }
    const blob = createHydrationBlob(largeData);

    // Act
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(Object.keys(decoded).length).toBe(5000);
    expect(decoded.key_0).toEqual(largeData.key_0);
    expect(decoded.key_4999).toEqual(largeData.key_4999);
  });

  it('should handle base64url without padding correctly', () => {
    // Arrange
    // Create some test data that might result in base64 that would normally need padding
    const testData = { a: 1 }; // Short data that might need padding
    const blob = createHydrationBlob(testData);

    // Act
    const decoded = decodeHydrationBlob(blob);

    // Assert
    expect(decoded).toEqual(testData);
    // Verify that the blob doesn't contain padding characters
    expect(blob).not.toContain('=');
  });
});