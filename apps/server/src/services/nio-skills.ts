import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bundled from './bundled-skills.json' with { type: 'json' };

interface NativeSkill {
  name: string;
  description: string;
  source: string;
  enabled: boolean;
}

export function parseGuruSkills(value: string): string[] {
  let names: unknown;
  try {
    names = JSON.parse(value);
  } catch {
    throw new Error('This Guru has an invalid skill selection. Update its skills before chatting.');
  }
  if (!Array.isArray(names) || names.length > 100 || names.some(name => typeof name !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(name))) {
    throw new Error('This Guru has an invalid skill selection. Update its skills before chatting.');
  }
  return [...new Set(names as string[])];
}

function nativeConfigPath(): string {
  return path.resolve(process.env.NIO_CONFIG ?? path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(process.env.HOME ?? os.homedir(), '.config'),
    'nio', 'config.json',
  ));
}

function nativeCatalog(): NativeSkill[] {
  const registryPath = path.join(path.dirname(nativeConfigPath()), 'skills', 'registry.json');
  if (!fs.existsSync(registryPath)) return [];
  const value: unknown = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (!Array.isArray(value) || value.some(skill => !skill || typeof skill.name !== 'string'
    || !/^[a-zA-Z0-9_-]{1,80}$/.test(skill.name) || typeof skill.enabled !== 'boolean'
    || typeof skill.description !== 'string' || typeof skill.source !== 'string')) {
    throw new Error('The Nio skill catalog is invalid. Repair it using nio --skills before chatting.');
  }
  return value;
}

// A Studio uninstall is shared: bundled fallback must not silently restore it.
function removedStudioDefaults(registry: NativeSkill[]): Set<string> {
  const marker = path.join(path.dirname(nativeConfigPath()), 'nio-de', 'studio-upstream-skills-v1.json');
  if (!fs.existsSync(marker)) return new Set();
  const history: unknown = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (!Array.isArray(history) || history.some(name => typeof name !== 'string')) {
    throw new Error('Cannot read shared Studio skill installation history.');
  }
  return new Set(history.filter(name => !registry.some(skill => skill.name === name)));
}

/** Bundled packages are installed into each turn's native catalog offline.
 * Native user installations override bundled versions, including disabled state.
 * Never rewrites the shared native registry or silently re-enables packages.
 */
export function listAvailableSkills(registry = nativeCatalog()): NativeSkill[] {
  const removed = removedStudioDefaults(registry);
  const stateDirectory = path.join(path.dirname(nativeConfigPath()), 'nio-guru');
  const marker = path.join(stateDirectory, 'native-skill-overrides-v1.json');
  const previous: unknown = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, 'utf8')) : [];
  if (!Array.isArray(previous) || previous.some(name => typeof name !== 'string')) {
    throw new Error('Cannot read NioGuru skill override history.');
  }
  for (const name of previous) {
    if (!registry.some(skill => skill.name === name)) removed.add(name);
  }
  const seen = [...new Set([...previous, ...registry.filter(skill => bundled.some(pack => pack.name === skill.name)).map(skill => skill.name)])];
  if (seen.length !== previous.length) {
    fs.mkdirSync(stateDirectory, { recursive: true });
    const temporary = path.join(stateDirectory, `.overrides-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    try {
      fs.writeFileSync(temporary, JSON.stringify(seen), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, marker);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  return [...registry.map(skill => ({ ...skill, enabled: skill.enabled && fs.existsSync(path.join(path.dirname(nativeConfigPath()), 'skills', skill.name, 'SKILL.md')) })), ...bundled.filter(skill => !removed.has(skill.name)
    && !registry.some(native => native.name === skill.name)).map(({ files, folder, revision, ...skill }) => skill)];
}

/** A turn-local native catalog; never changes the user's enabled skills. */
export function prepareSkillSelection(names: string[]): {
  configPath: string;
  unavailable: string[];
  cleanup: () => void;
} {
  names = parseGuruSkills(JSON.stringify(names));
  const configPath = nativeConfigPath();
  const base = path.dirname(configPath);
  const registry = nativeCatalog();
  const available = listAvailableSkills(registry);
  const selected: NativeSkill[] = [];
  const unavailable: string[] = [];
  for (const name of names) {
    const skill = available.find(skill => skill.name === name && skill.enabled);
    const native = registry.some(skill => skill.name === name);
    if (!skill || (native && !fs.existsSync(path.join(base, 'skills', name, 'SKILL.md')))) {
      unavailable.push(name);
    } else {
      selected.push(skill);
    }
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nio-guru-skills-'));
  const cleanup = () => fs.rmSync(temporary, { recursive: true, force: true });
  try {
    fs.chmodSync(temporary, 0o700);
    const temporaryConfig = path.join(temporary, 'config.json');
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, temporaryConfig);
      fs.chmodSync(temporaryConfig, 0o600);
    }
    const skillsDirectory = path.join(temporary, 'skills');
    fs.mkdirSync(skillsDirectory);
    for (const skill of selected) {
      const target = path.join(skillsDirectory, skill.name);
      if (registry.some(native => native.name === skill.name)) {
        let count = 0, bytes = 0;
        fs.cpSync(path.join(base, 'skills', skill.name), target, {
          recursive: true,
          filter: source => {
            const stat = fs.lstatSync(source);
            const relative = path.relative(path.join(base, 'skills', skill.name), source);
            if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
              throw new Error(`Skill ${skill.name} contains an unsupported file. Reinstall it using nio --skills.`);
            }
            if (relative.split(path.sep).length > 16) throw new Error(`Skill ${skill.name} is too deeply nested.`);
            if (stat.isFile()) { count++; bytes += stat.size; }
            if (count > 2000 || bytes > 16 * 1024 * 1024) throw new Error(`Skill ${skill.name} exceeds Nio's package limit.`);
            return true;
          },
        });
      } else {
        const packageData = bundled.find(packageData => packageData.name === skill.name)!;
        for (const [relative, content] of Object.entries(packageData.files)) {
          if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) {
            throw new Error('Invalid bundled skill path.');
          }
          const destination = path.join(target, relative);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, Buffer.from(content, 'base64'), { mode: 0o600, flag: 'wx' });
        }
      }
    }
    fs.writeFileSync(path.join(skillsDirectory, 'registry.json'), JSON.stringify(selected), { mode: 0o600 });
    const sessionsDirectory = path.join(base, 'sessions');
    fs.mkdirSync(sessionsDirectory, { recursive: true });
    fs.symlinkSync(sessionsDirectory, path.join(temporary, 'sessions'), process.platform === 'win32' ? 'junction' : 'dir');
    return { configPath: temporaryConfig, unavailable, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
