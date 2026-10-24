import metadata from '../package.json' with { type: 'json' };

// npm uses SemVer; Python releases and the UI use PEP 440 prerelease spelling.
export const VERSION = metadata.version.replace(
  /-(alpha|beta|rc)\.(\d+)$/,
  (_, stage: string, number: string) => `${{ alpha: 'a', beta: 'b', rc: 'rc' }[stage]}${number}`,
);
