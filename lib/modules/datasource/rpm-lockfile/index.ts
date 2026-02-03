import { logger } from '../../../logger';
import { getDetectedUpdate } from '../../manager/rpm-lockfile/common';
import { Datasource } from '../datasource';
import type { GetReleasesConfig, ReleaseResult } from '../types';

/**
 * RPM Lockfile Datasource
 *
 * This datasource works in conjunction with the rpm-lockfile manager.
 * During the extract phase, the manager runs `rpm-lockfile-prototype` to
 * detect available updates. These detected updates are stored and retrieved
 * by this datasource.
 *
 * The datasource returns:
 * - The current version as a release
 * - If an update was detected during extract, the new version as a release
 */
export class RpmLockfileDatasource extends Datasource {
  static readonly id = 'rpm-lockfile';

  override readonly caching = false;

  constructor() {
    super(RpmLockfileDatasource.id);
  }

  override async getReleases(
    config: GetReleasesConfig,
  ): Promise<ReleaseResult | null> {
    const { packageName, currentValue } = config;

    if (!currentValue) {
      return null;
    }

    // Get the lock file from registryUrl
    const lockFile = config.registryUrl ?? '';

    logger.debug(
      { packageName, currentValue, lockFile },
      'rpm-lockfile datasource getReleases',
    );

    const releases: ReleaseResult['releases'] = [
      {
        version: currentValue,
      },
    ];

    // Check if we detected an update for this package during extract
    const newVersion = getDetectedUpdate(lockFile, packageName);
    logger.debug(
      { packageName, lockFile, newVersion },
      'rpm-lockfile datasource getDetectedUpdate result',
    );

    if (newVersion && newVersion !== currentValue) {
      releases.push({
        version: newVersion,
      });
      logger.debug(
        { packageName, currentValue, newVersion },
        'rpm-lockfile datasource adding new version',
      );
    }

    return {
      releases,
    };
  }
}
