// Shared state between extract and datasource

// Map of "lockFile:packageName" -> newVersion
const detectedUpdates = new Map<string, string>();

// Map of lockFile -> new lock file content
const newLockFileCache = new Map<string, string>();

// Map of packageFile -> original content (for restoring after update)
const originalInputFileCache = new Map<string, string>();

export function setDetectedUpdate(
  lockFile: string,
  packageName: string,
  newVersion: string,
): void {
  detectedUpdates.set(`${lockFile}:${packageName}`, newVersion);
}

export function getDetectedUpdate(
  lockFile: string,
  packageName: string,
): string | undefined {
  return detectedUpdates.get(`${lockFile}:${packageName}`);
}

export function clearDetectedUpdates(): void {
  detectedUpdates.clear();
}

export function setNewLockFileContent(lockFile: string, content: string): void {
  newLockFileCache.set(lockFile, content);
}

export function getNewLockFileContent(lockFile: string): string | undefined {
  return newLockFileCache.get(lockFile);
}

export function clearNewLockFileCache(): void {
  newLockFileCache.clear();
}

export function setOriginalInputFileContent(
  packageFile: string,
  content: string,
): void {
  originalInputFileCache.set(packageFile, content);
}

export function getOriginalInputFileContent(
  packageFile: string,
): string | undefined {
  return originalInputFileCache.get(packageFile);
}

export function clearOriginalInputFileCache(): void {
  originalInputFileCache.clear();
}
