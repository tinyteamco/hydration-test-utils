import type { HydrationRegistry, HydrationResult, HydrateOptions, HydrationSectionResult, HydrationLogger } from './types';
import { decodeHydrationBlob } from './blob';
import type { WritableAtom } from 'jotai';
import { getDefaultStore } from 'jotai';

// Extended options type for testing
interface ExtendedHydrateOptions extends HydrateOptions {
  _testStore?: {
    get: (atom: any) => any;
    set: (atom: WritableAtom<any, any[], any>, value: any) => void;
  };
}

/**
 * Hydrates a Jotai atom registry from an encoded blob.
 * Decodes the blob, validates data against schemas, and sets atom values.
 * 
 * @param blob - The encoded hydration blob (from createHydrationBlob)
 * @param registry - The hydration registry defining sections, schemas, and atoms
 * @param options - Optional configuration for hydration behavior
 * @returns A result object indicating success/failure for each section
 * 
 * @example
 * const result = await hydrateFromEncodedBlob(blob, registry, {
 *   strict: true,  // Enforce 1:1 mapping between schema and atoms
 *   logger: customLogger
 * });
 * 
 * if (result.overallSuccess) {
 *   console.log('All sections hydrated successfully');
 * } else {
 *   console.error('Some sections failed:', result.sections);
 * }
 */
export async function hydrateFromEncodedBlob(
  blob: string,
  registry: HydrationRegistry,
  options?: ExtendedHydrateOptions
): Promise<HydrationResult> {
  const logger = options?.logger || {
    info: (...args: unknown[]) => console.info('[Hydration]', ...args),
    warn: (...args: unknown[]) => console.warn('[Hydration]', ...args),
    error: (...args: unknown[]) => console.error('[Hydration]', ...args),
  };

  const strict = options?.strict !== false; // Default to true
  const testStore = options?._testStore;

  const result: HydrationResult = {
    sections: {},
    overallSuccess: true,
  };

  logger.info?.('Starting hydration from encoded blob');

  // Step 1: Decode the blob
  let decodedData: any;
  try {
    decodedData = decodeHydrationBlob(blob);
    logger.info?.('Successfully decoded blob');
  } catch (error) {
    const errorMessage = `Failed to decode blob: ${(error as Error).message}`;
    logger.error?.(errorMessage);
    
    // Mark all registry sections as failed
    for (const sectionName of Object.keys(registry)) {
      result.sections[sectionName] = {
        success: false,
        error: errorMessage,
      };
    }
    result.overallSuccess = false;
    return result;
  }

  // Step 2: Process each section in the registry
  for (const [sectionName, registryEntry] of Object.entries(registry)) {
    logger.info?.(`Processing section: ${sectionName}`);

    // Check if data exists for this section
    if (!(sectionName in decodedData)) {
      logger.info?.(`No data for section: ${sectionName}, skipping`);
      continue;
    }

    const sectionData = decodedData[sectionName];
    const sectionResult: HydrationSectionResult = {
      success: true,
      appliedFields: [],
    };

    // Step 3: Validate data against schema
    const validationResult = registryEntry.schema.safeParse(sectionData);
    
    if (!validationResult.success) {
      // Validation failed
      const errorMessage = validationResult.error.issues
        .map(err => {
          const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
          return `${path}${err.message}`;
        })
        .join(', ');
      
      logger.error?.(`Validation failed for section ${sectionName}: ${errorMessage}`);
      
      sectionResult.success = false;
      sectionResult.error = errorMessage;
      result.sections[sectionName] = sectionResult;
      result.overallSuccess = false;
      continue;
    }

    // Step 4: Check strict mode constraints
    const atomKeys = Object.keys(registryEntry.atoms);
    
    if (strict) {
      // Extract schema keys from Zod schema
      let schemaKeys: string[] = [];
      
      // Check if the schema has a shape property (ZodObject)
      const schema = registryEntry.schema as any;
      if (schema && typeof schema === 'object' && schema._def && schema._def.shape) {
        // This is a ZodObject, we can get the keys from its shape
        schemaKeys = Object.keys(schema._def.shape);
      } else {
        // Fallback: use the validated data keys as an approximation
        // This isn't perfect but maintains backward compatibility
        schemaKeys = Object.keys(validationResult.data);
        logger.warn?.(`Unable to extract schema shape for section ${sectionName}, using data keys for strict validation`);
      }

      // Check for missing atoms (schema fields without corresponding atoms)
      const missingAtoms = schemaKeys.filter(key => !atomKeys.includes(key));
      if (missingAtoms.length > 0) {
        const errorMessage = `Schema fields missing atom: ${missingAtoms.join(', ')}`;
        logger.error?.(`Strict mode violation in section ${sectionName}: ${errorMessage}`);
        
        sectionResult.success = false;
        sectionResult.error = errorMessage;
        result.sections[sectionName] = sectionResult;
        result.overallSuccess = false;
        continue;
      }

      // Check for extra atoms (atoms without corresponding schema fields)
      const extraAtoms = atomKeys.filter(key => !schemaKeys.includes(key));
      if (extraAtoms.length > 0) {
        const errorMessage = `Extra atoms not in schema: ${extraAtoms.join(', ')}`;
        logger.error?.(`Strict mode violation in section ${sectionName}: ${errorMessage}`);
        
        sectionResult.success = false;
        sectionResult.error = errorMessage;
        result.sections[sectionName] = sectionResult;
        result.overallSuccess = false;
        continue;
      }
    }

    // Step 5: Apply values to atoms
    // Only process fields that are actually present in the data
    for (const [fieldName, value] of Object.entries(validationResult.data)) {
      // Skip undefined values (optional fields not provided)
      if (value === undefined) {
        continue;
      }
      const atom = registryEntry.atoms[fieldName];
      
      if (!atom) {
        // No atom for this field
        if (!strict) {
          const warning = `No atom found for field: ${fieldName}`;
          logger.warn?.(warning);
          if (!sectionResult.warnings) {
            sectionResult.warnings = [];
          }
          sectionResult.warnings.push(warning);
        }
        continue;
      }

      // Set the atom value
      try {
        // Use test store if provided, otherwise use default store
        const store = testStore || getDefaultStore();
        store.set(atom as WritableAtom<any, any[], any>, value);
        
        sectionResult.appliedFields?.push(fieldName);
      } catch (error) {
        logger.error?.(`Failed to set atom for field ${fieldName}:`, error);
        sectionResult.success = false;
        sectionResult.error = `Failed to set atom for field ${fieldName}: ${(error as Error).message}`;
        result.overallSuccess = false;
        break;
      }
    }

    result.sections[sectionName] = sectionResult;
  }

  logger.info?.('Hydration complete', { overallSuccess: result.overallSuccess });
  return result;
}