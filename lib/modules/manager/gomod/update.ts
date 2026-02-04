// TODO: types (#22198)
import { logger } from '../../../logger/index.ts';
import { newlineRegex, regEx } from '../../../util/regex.ts';
import type { UpdateDependencyConfig } from '../types.ts';

function getNameWithNoVersion(name: string): string {
  // remove version suffixes like /v1 or /v2
  let nameNoVersion = name.replace(regEx(/\/v\d+$/), '');
  // gopkg.in is a special case where the major version is added with a dot rather than a slash
  if (nameNoVersion.startsWith('gopkg.in')) {
    nameNoVersion = nameNoVersion.replace(regEx(/\.v\d+$/), '');
  }
  return nameNoVersion;
}

export function updateDependency({
  fileContent,
  upgrade,
}: UpdateDependencyConfig): string | null {
  try {
    logger.debug(`gomod.updateDependency: ${upgrade.newValue}`);
    const { depType, updateType } = upgrade;
    const currentName = upgrade.depName;
    if (updateType === 'replacement') {
      logger.warn('gomod manager does not support replacement updates yet');
      return null;
    }
    /* v8 ignore next 3 -- should never happen */
    if (!currentName || !upgrade.managerData) {
      return null;
    }
    const currentNameNoVersion = getNameWithNoVersion(currentName);
    const lines = fileContent.split(newlineRegex);
    /* v8 ignore next 4 -- hard to test */
    if (lines.length <= upgrade.managerData.lineNumber) {
      logger.warn('go.mod current line no longer exists after update');
      return null;
    }
    const lineToChange = lines[upgrade.managerData.lineNumber];
    logger.trace({ upgrade, lineToChange }, 'go.mod current line');
    if (
      !lineToChange.includes(currentNameNoVersion) &&
      !lineToChange.includes('rethinkdb/rethinkdb-go.v5')
    ) {
      logger.debug(
        { lineToChange, depName: currentName },
        "go.mod current line doesn't contain dependency",
      );
      return null;
    }
    let updateLineExp: RegExp | undefined;

    if (depType === 'golang' || depType === 'toolchain') {
      updateLineExp = regEx(
        /(?<depPart>(?:toolchain )?go)(?<divider>\s*)([^\s]+|[\w]+)/,
      );
    }
    if (depType === 'replace') {
      if (upgrade.managerData.multiLine) {
        updateLineExp = regEx(
          /^(?<depPart>\s+[^\s]+[\s]+[=][>]+\s+)(?<divider>[^\s]+\s+)[^\s]+/,
        );
      } else {
        updateLineExp = regEx(
          /^(?<depPart>replace\s+[^\s]+[\s]+[=][>]+\s+)(?<divider>[^\s]+\s+)[^\s]+/,
        );
      }
    } else if (depType === 'require' || depType === 'indirect') {
      if (upgrade.managerData.multiLine) {
        updateLineExp = regEx(/^(?<depPart>\s+[^\s]+)(?<divider>\s+)[^\s]+/);
      } else {
        updateLineExp = regEx(
          /^(?<depPart>require\s+[^\s]+)(?<divider>\s+)[^\s]+/,
        );
      }
    }
    if (updateLineExp && !updateLineExp.test(lineToChange)) {
      logger.debug('No line found to update');
      return null;
    }
    let newLine: string;
    if (upgrade.updateType === 'digest') {
      // For Go pseudo-versions (v0.0.0-timestamp-digest), we need to write
      // the full pseudo-version, not just the digest portion
      if (upgrade.newValue?.startsWith('v0.0.0-')) {
        // This is a pseudo-version update, use the full newValue
        logger.debug(
          { depName: currentName, lineToChange, newValue: upgrade.newValue },
          'gomod: updating pseudo-version digest',
        );
        newLine = lineToChange.replace(
          // TODO: can be undefined? (#22198)
          updateLineExp!,
          `$<depPart>$<divider>${upgrade.newValue}`,
        );
      } else {
        // Defensive fallback: Non-pseudo-version digest update
        //
        // NOTE: This branch should be unreachable for the gomod manager because:
        //
        // 1. WHERE currentDigest IS EXTRACTED:
        //    - In lib/modules/manager/gomod/line-parser.ts, extractDigest() uses
        //      pseudoVersionRegex which ONLY matches pseudo-version format:
        //      /v\d+\.\d+\.\d+-(?:\w+\.)?(?:0\.)?\d{14}-(?<digest>[a-f0-9]{12})/
        //    - This means currentDigest is ONLY set for pseudo-versions like
        //      "v0.0.0-20260120122510-4a022ed9999a"
        //    - Regular semver versions (v1.2.3) do NOT have currentDigest set
        //
        // 2. WHEN updateType IS SET TO 'digest':
        //    a) Special gomod override (lib/workers/repository/process/lookup/index.ts:517):
        //       - Requires: config.manager === 'gomod'
        //       - Requires: compareValue?.startsWith('v0.0.0-')  // current is pseudo
        //       - Requires: update.newValue?.startsWith('v0.0.0-')  // new is pseudo
        //       - Result: updateType = 'digest' ONLY for pseudo → pseudo updates
        //
        //    b) General digest update (lib/workers/repository/process/lookup/index.ts:634):
        //       - Only triggers if config.currentDigest exists
        //       - currentDigest only exists for pseudo-versions (see #1 above)
        //       - Result: updateType = 'digest' ONLY when currentDigest exists
        //
        // 3. CONCLUSION:
        //    - For gomod: updateType === 'digest' implies the version is a pseudo-version
        //    - Therefore: upgrade.newValue ALWAYS starts with 'v0.0.0-'
        //    - Therefore: This else branch is never reached
        //
        // 4. WHY WE KEEP THIS BRANCH:
        //    - Defensive programming: handles unexpected edge cases
        //    - Preserves original behavior if assumptions change in the future
        //    - Makes the code's intent explicit and self-documenting
        //
        const newDigestRightSized = upgrade.newDigest!.substring(
          0,
          upgrade.currentDigest!.length,
        );
        if (lineToChange.includes(newDigestRightSized)) {
          return fileContent;
        }
        logger.debug(
          { depName: currentName, lineToChange, newDigestRightSized },
          'gomod: need to update digest',
        );
        newLine = lineToChange.replace(
          // TODO: can be undefined? (#22198)
          updateLineExp!,
          `$<depPart>$<divider>${newDigestRightSized}`,
        );
      }
    } else {
      newLine = lineToChange.replace(
        // TODO: can be undefined? (#22198)
        updateLineExp!,
        `$<depPart>$<divider>${upgrade.newValue}`,
      );
    }
    if (upgrade.updateType === 'major') {
      logger.debug(`gomod: major update for ${currentName}`);
      if (currentName.startsWith('gopkg.in/')) {
        const oldV = currentName.split('.').pop();
        newLine = newLine.replace(`.${oldV}`, `.v${upgrade.newMajor}`);
        // Package renames - I couldn't think of a better place to do this
        newLine = newLine.replace(
          'gorethink/gorethink.v5',
          'rethinkdb/rethinkdb-go.v5',
        );
      } else if (
        upgrade.newMajor! > 1 &&
        !newLine.includes(`/v${upgrade.newMajor}`) &&
        !upgrade.newValue!.endsWith('+incompatible')
      ) {
        if (currentName === currentNameNoVersion) {
          // If package currently has no version, pin to latest one.
          newLine = newLine.replace(
            currentName,
            `${currentName}/v${upgrade.newMajor}`,
          );
        } else {
          // Replace version
          const [oldV] = upgrade.currentValue!.split('.');
          newLine = newLine.replace(
            regEx(`/${oldV}(\\s+)`, undefined, false),
            `/v${upgrade.newMajor}$1`,
          );
        }
      }
    }
    if (
      lineToChange.endsWith('+incompatible') &&
      !upgrade.newValue?.endsWith('+incompatible')
    ) {
      let toAdd = '+incompatible';

      if (upgrade.updateType === 'major' && upgrade.newMajor! >= 2) {
        toAdd = '';
      }
      newLine += toAdd;
    }
    if (newLine === lineToChange) {
      logger.debug('No changes necessary');
      return fileContent;
    }

    if (depType === 'indirect') {
      newLine = newLine.replace(
        regEx(/\s*(?:\/\/\s*indirect(?:\s*;)?\s*)*$/),
        ' // indirect',
      );
    }

    lines[upgrade.managerData.lineNumber] = newLine;
    return lines.join('\n');
  } catch (err) {
    logger.debug({ err }, 'Error setting new go.mod version');
    return null;
  }
}
