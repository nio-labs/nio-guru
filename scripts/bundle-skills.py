#!/usr/bin/env python3
"""Refresh bundled upstream snapshots. Runtime installation never uses Git/network.

Run with --refresh to resolve new revisions, or without it to rebuild the pinned
manifest. Only this maintenance command needs GitHub access; no Git is required.
"""
import concurrent.futures
import io
import json
from pathlib import Path
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'packages/bundled-skills'
PACKAGES = [
    ('visual-design-foundations', 'wshobson/agents', 'plugins/ui-design/skills/visual-design-foundations'),
    ('data-storytelling', 'wshobson/agents', 'plugins/business-analytics/skills/data-storytelling'),
    ('frontend-design', 'anthropics/skills', 'skills/frontend-design'),
    ('svg-design', 'tryopendata/skills', 'plugins/opendesign/skills/svg-design'),
    ('doc-coauthoring', 'anthropics/skills', 'skills/doc-coauthoring'),
    ('error-handling-patterns', 'wshobson/agents', 'plugins/developer-essentials/skills/error-handling-patterns'),
    ('supabase-postgres-best-practices', 'supabase/agent-skills', 'skills/supabase-postgres-best-practices'),
    ('data-visualization', 'anthropics/knowledge-work-plugins', 'data/skills/data-visualization'),
]
PACKAGES += [
    ('architecture-patterns', 'wshobson/agents', 'plugins/backend-development/skills/architecture-patterns'),
    ('debugging-strategies', 'wshobson/agents', 'plugins/developer-essentials/skills/debugging-strategies'),
    ('deployment-pipeline-design', 'wshobson/agents', 'plugins/cicd-automation/skills/deployment-pipeline-design'),
    ('stride-analysis-patterns', 'wshobson/agents', 'plugins/security-scanning/skills/stride-analysis-patterns'),
    ('backtesting-frameworks', 'wshobson/agents', 'plugins/quantitative-trading/skills/backtesting-frameworks'),
    ('risk-metrics-calculation', 'wshobson/agents', 'plugins/quantitative-trading/skills/risk-metrics-calculation'),
]

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'nio-de-skill-bundler'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()

def api(path):
    return json.loads(fetch('https://api.github.com/' + path))

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    pinned = {} if '--refresh' in sys.argv else {
        p['source'].removeprefix('https://github.com/'): p['revision']
        for p in json.loads((ROOT / 'manifest.json' if (ROOT / 'manifest.json').exists() else
                            ROOT / 'manifest.json').read_text())
    }
    repositories = {}
    for _, repo, _ in PACKAGES:
        if repo in repositories:
            continue
        revision = pinned.get(repo) or api(f'repos/{repo}/commits/HEAD')['sha']
        tree = api(f'repos/{repo}/git/trees/{revision}?recursive=1')
        if tree.get('truncated'):
            raise ValueError(f'Truncated tree: {repo}')
        repositories[repo] = (revision, tree['tree'])
    if '--list-upstream' in sys.argv:
        for repo, (_, tree) in repositories.items():
            for item in tree:
                if item['path'].endswith('/SKILL.md'):
                    print(repo, item['path'])
        return
    manifest, contents = [], {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for name, repo, folder in PACKAGES:
            revision, tree = repositories[repo]
            files = {item['path'][len(folder) + 1:]: item['path'] for item in tree
                     if item['type'] == 'blob' and item['path'].startswith(folder + '/')}
            if 'SKILL.md' not in files or len(files) > 2000:
                raise ValueError(f'Invalid package: {name}')
            for item in tree:
                if item['path'].startswith(folder + '/') and item.get('mode') == '120000':
                    raise ValueError(f'Symbolic link: {item["path"]}')
            # Preserve repository and enclosing-folder license/notice files too.
            ancestors = [''] + [str(parent) + '/' for parent in Path(folder).parents if str(parent) != '.']
            for item in tree:
                path = item['path']
                if item['type'] == 'blob' and any(path.startswith(parent) and '/' not in path[len(parent):]
                        for parent in ancestors) and Path(path).name.upper().startswith(('LICENSE', 'NOTICE', 'COPYING')):
                    files['UPSTREAM-LICENSES/' + path.replace('/', '__')] = path
            # Anthropic declares example skills Apache-2.0 in README; this one
            # has no local license file. Preserve that declaration and the
            # standard Apache text shipped alongside its frontend example.
            if repo == 'anthropics/skills' and name == 'doc-coauthoring':
                files['UPSTREAM-LICENSES/README.md'] = 'README.md'
                files['UPSTREAM-LICENSES/Apache-2.0.txt'] = 'skills/frontend-design/LICENSE.txt'
            if not any('LICENSE' in path.upper() or 'COPYING' in path.upper() for path in files):
                raise ValueError(f'Missing redistribution license: {name}')
            futures = {path: pool.submit(fetch, f'https://raw.githubusercontent.com/{repo}/{revision}/{upstream}')
                       for path, upstream in files.items()}
            package = {path: future.result() for path, future in futures.items()}
            if sum(map(len, package.values())) > 16 * 1024 * 1024:
                raise ValueError(f'Oversized package: {name}')
            text = package['SKILL.md'].decode()
            frontmatter = text.split('---', 2)[1]
            fields = dict(line.split(':', 1) for line in frontmatter.splitlines() if ':' in line)
            if fields.get('name', '').strip().strip('\"\'') != name:
                raise ValueError(f'Unexpected skill name: {name}')
            manifest.append({'name': name, 'description': fields.get('description', '').strip().strip('\"\''),
                             'source': 'https://github.com/' + repo, 'folder': folder, 'revision': revision,
                             'enabled': True})
            attribution = f'Upstream: https://github.com/{repo}/tree/{revision}/{folder}\nUnmodified upstream package; license files are preserved.\n'
            package['UPSTREAM-SOURCE.txt'] = attribution.encode()
            contents.update({name + '/' + path: data for path, data in package.items()})
            print(f'{name}: {len(package)} files, revision {revision}', flush=True)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        for path, data in sorted(contents.items()):
            entry = zipfile.ZipInfo(path, (2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            output.writestr(entry, data)
    (ROOT / 'upstream.zip').write_bytes(archive.getvalue())
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    import base64
    for skill in manifest:
        prefix = skill['name'] + '/'
        skill['files'] = {name[len(prefix):]: base64.b64encode(data).decode()
                          for name, data in contents.items() if name.startswith(prefix)}
    destination = Path(__file__).resolve().parents[1] / 'apps/server/src/services/bundled-skills.json'
    destination.write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    main()
