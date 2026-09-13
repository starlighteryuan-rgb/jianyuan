#!/usr/bin/env node

/**
 * Local, read-only JSON dataset profiler.
 *
 * Privacy boundary:
 * - reads one JSON file at a time;
 * - never performs network I/O;
 * - never imports application/domain services;
 * - never prints or writes raw field values;
 * - hashes candidate ID/URL values immediately for duplicate counting.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_INPUT =
  process.env.ZHIHU_DATASET_INPUT ?? resolve(PROJECT_ROOT, 'data', 'raw', 'zhihu_search');
const DEFAULT_OUTPUT = resolve(PROJECT_ROOT, 'docs', 'zhihu-dataset-profile.md');

const LENGTH_BUCKETS = [
  { label: '0', min: 0, max: 0 },
  { label: '1-50', min: 1, max: 50 },
  { label: '51-200', min: 51, max: 200 },
  { label: '201-500', min: 201, max: 500 },
  { label: '501-1,000', min: 501, max: 1_000 },
  { label: '1,001-5,000', min: 1_001, max: 5_000 },
  { label: '>5,000', min: 5_001, max: Number.POSITIVE_INFINITY },
];

const CATEGORIES = ['id', 'url', 'author', 'time', 'text'];

const parseArgs = (argv) => {
  const options = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input' || arg === '--output') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a path.`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }

    if (arg === '--help') {
      process.stdout.write(
        'Usage: node scripts/profile-zhihu-dataset.mjs [--input DIR] [--output FILE]\n',
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    input: resolve(options.input),
    output: isAbsolute(options.output)
      ? resolve(options.output)
      : resolve(PROJECT_ROOT, options.output),
  };
};

const isWithin = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
};

const listJsonFiles = async (root) => {
  const files = [];
  let skippedSymlinks = 0;
  let nonJsonFiles = 0;

  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinks += 1;
      } else if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
        files.push(path);
      } else if (entry.isFile()) {
        nonJsonFiles += 1;
      }
    }
  };

  await visit(root);
  return { files, skippedSymlinks, nonJsonFiles };
};

const jsonType = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const safeSegment = (key) =>
  /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key)
    ? `.${key}`
    : `[${JSON.stringify(key)}]`;

const scalarValues = function* (value) {
  if (Array.isArray(value)) {
    for (const item of value) yield* scalarValues(item);
    return;
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    yield value;
  }
};

const categoryMatches = (category, path, key) => {
  const name = key.toLowerCase();
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .split('_')
    .filter(Boolean);
  const fullWords = path
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .split('_')
    .filter(Boolean);

  switch (category) {
    case 'id':
      return (
        name === 'id' ||
        name.endsWith('id') ||
        name.endsWith('_id') ||
        name.endsWith('-id') ||
        name.includes('token') ||
        words.includes('id') ||
        words.includes('ids')
      );
    case 'url':
      return (
        /(url|uri|href|link)/i.test(name) ||
        name.endsWith('avatar') ||
        name.endsWith('badge')
      );
    case 'author':
      return fullWords.some((word) =>
        ['author', 'creator', 'owner', 'nickname', 'account', 'user'].includes(word),
      );
    case 'time':
      return /(time|date|timestamp|created|updated|edited|publish)/i.test(name);
    case 'text':
      return (
        name === 'text' ||
        name === 'content' ||
        name === 'contenttext' ||
        words.some((word) =>
          [
            'title',
            'summary',
            'excerpt',
            'body',
            'description',
            'abstract',
            'question',
            'answer',
          ].includes(word),
        )
      );
    default:
      return false;
  }
};

const normalizeCandidateValue = (value) => {
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : `string:${trimmed}`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `number:${String(value)}` : null;
  }
  if (typeof value === 'boolean') return `boolean:${String(value)}`;
  return null;
};

const hashValue = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const newProfile = () => ({
  totalBytes: 0,
  fileSizes: [],
  parseSuccess: 0,
  parseFailure: 0,
  readFailure: 0,
  parseFailureKinds: new Map(),
  rootTypes: new Map(),
  objectPopulations: new Map(),
  fields: new Map(),
  candidates: new Map(CATEGORIES.map((category) => [category, new Map()])),
  textLengths: [],
  textLengthsByPath: new Map(),
});

const increment = (map, key, amount = 1) => {
  map.set(key, (map.get(key) ?? 0) + amount);
};

const parseFailureKind = (error) => {
  if (!(error instanceof SyntaxError)) return 'other_parse_error';
  const message = error.message.toLowerCase();
  if (message.includes('unexpected end')) return 'unexpected_end';
  if (message.includes('unexpected token')) return 'unexpected_token';
  if (message.includes('not valid json')) return 'invalid_json_syntax';
  return 'syntax_error';
};

const codePointLength = (value) => Array.from(value).length;

const profileDocument = (root, fileIndex, profile) => {
  increment(profile.rootTypes, jsonType(root));

  const visitObject = (object, objectPath) => {
    increment(profile.objectPopulations, objectPath);

    for (const [key, value] of Object.entries(object)) {
      const fieldPath = `${objectPath}${safeSegment(key)}`;
      let field = profile.fields.get(fieldPath);
      if (field === undefined) {
        field = {
          path: fieldPath,
          key,
          parentPath: objectPath,
          occurrences: 0,
          fileIndexes: new Set(),
          types: new Map(),
        };
        profile.fields.set(fieldPath, field);
      }

      field.occurrences += 1;
      field.fileIndexes.add(fileIndex);
      increment(field.types, jsonType(value));

      for (const category of CATEGORIES) {
        if (!categoryMatches(category, fieldPath, key)) continue;

        const categoryMap = profile.candidates.get(category);
        let candidate = categoryMap.get(fieldPath);
        if (candidate === undefined) {
          candidate = {
            path: fieldPath,
            values: 0,
            blanks: 0,
            hashes: new Map(),
          };
          categoryMap.set(fieldPath, candidate);
        }

        for (const scalar of scalarValues(value)) {
          const normalized = normalizeCandidateValue(scalar);
          if (normalized === null) {
            candidate.blanks += 1;
            continue;
          }

          candidate.values += 1;
          if (category === 'id' || category === 'url') {
            increment(candidate.hashes, hashValue(normalized));
          }

          if (category === 'text' && typeof scalar === 'string') {
            const length = codePointLength(scalar);
            profile.textLengths.push(length);
            let perField = profile.textLengthsByPath.get(fieldPath);
            if (perField === undefined) {
              perField = [];
              profile.textLengthsByPath.set(fieldPath, perField);
            }
            perField.push(length);
          }
        }
      }

      if (Array.isArray(value)) {
        visitArray(value, `${fieldPath}[]`);
      } else if (value !== null && typeof value === 'object') {
        visitObject(value, fieldPath);
      }
    }
  };

  const visitArray = (array, arrayPath) => {
    for (const item of array) {
      if (Array.isArray(item)) {
        visitArray(item, `${arrayPath}[]`);
      } else if (item !== null && typeof item === 'object') {
        visitObject(item, arrayPath);
      }
    }
  };

  if (Array.isArray(root)) visitArray(root, '$[]');
  else if (root !== null && typeof root === 'object') visitObject(root, '$');
};

const percent = (numerator, denominator) =>
  denominator === 0 ? '0.00%' : `${((numerator / denominator) * 100).toFixed(2)}%`;

const number = (value) => new Intl.NumberFormat('en-US').format(value);

const percentile = (sorted, value) => {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((value / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
};

const lengthSummary = (lengths) => {
  if (lengths.length === 0) {
    return { count: 0, min: 0, mean: 0, p50: 0, p90: 0, p95: 0, max: 0 };
  }

  const sorted = [...lengths].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    mean: Math.round((sum / sorted.length) * 100) / 100,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
};

const duplicateSummary = (hashes) => {
  let groups = 0;
  let repeatedOccurrences = 0;
  for (const count of hashes.values()) {
    if (count > 1) {
      groups += 1;
      repeatedOccurrences += count - 1;
    }
  }
  return { groups, repeatedOccurrences };
};

const typeSummary = (types) =>
  [...types.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}:${number(count)}`)
    .join(', ');

const markdownCode = (value) => {
  const safe = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replaceAll('|', '\\|')
    .replaceAll('`', '\\`');
  const shortened = safe.length > 240 ? `${safe.slice(0, 237)}...` : safe;
  return `\`${shortened}\``;
};

const candidateRows = (category, profile) => {
  const candidates = profile.candidates.get(category);
  return [...candidates.values()]
    .map((candidate) => {
      const field = profile.fields.get(candidate.path);
      const parentPopulation = profile.objectPopulations.get(field.parentPath) ?? 0;
      const duplicates = duplicateSummary(candidate.hashes);
      return {
        ...candidate,
        files: field.fileIndexes.size,
        occurrences: field.occurrences,
        parentPopulation,
        missing: Math.max(0, parentPopulation - field.occurrences),
        types: typeSummary(field.types),
        ...duplicates,
      };
    })
    .sort(
      (left, right) =>
        right.occurrences - left.occurrences || left.path.localeCompare(right.path),
    );
};

const table = (headers, rows) => {
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  if (rows.length === 0) lines.push(`| ${headers.map(() => '-').join(' | ')} |`);
  return lines.join('\n');
};

const buildReport = ({ input, output, inventory, profile, generatedAt }) => {
  const successful = profile.parseSuccess;
  const rootObjectFiles = profile.rootTypes.get('object') ?? 0;
  const fields = [...profile.fields.values()].sort(
    (left, right) =>
      right.occurrences - left.occurrences || left.path.localeCompare(right.path),
  );
  const topLevel = fields.filter((field) => field.parentPath === '$');
  const lengths = lengthSummary(profile.textLengths);

  const sections = [];
  sections.push('# Zhihu Dataset Profile');
  sections.push('');
  sections.push('## 扫描边界');
  sections.push('');
  sections.push(`- 实际数据目录：${markdownCode(input)}`);
  sections.push(`- 报告文件：${markdownCode(output)}`);
  sections.push(`- 生成时间：${generatedAt.toISOString()}`);
  sections.push('- 扫描方式：递归、逐文件、一次只解析一个 JSON。');
  sections.push('- 数据处理：不联网、不上传、不调用 Domain/Ingestion/ExternalReference，不创建 Record。');
  sections.push('- 隐私处理：报告不包含原始正文、作者值、ID 值或 URL 值；重复统计只保留 SHA-256 哈希计数。');
  sections.push('');
  sections.push('## 文件与解析结果');
  sections.push('');
  sections.push(
    table(
      ['指标', '数量'],
      [
        ['JSON 文件', number(inventory.files.length)],
        ['解析成功', number(profile.parseSuccess)],
        ['解析失败', number(profile.parseFailure)],
        ['读取失败', number(profile.readFailure)],
        ['非 JSON 文件（未读取）', number(inventory.nonJsonFiles)],
        ['符号链接（未跟随）', number(inventory.skippedSymlinks)],
        ['总字节数', number(profile.totalBytes)],
      ],
    ),
  );
  sections.push('');
  sections.push('根值类型：');
  sections.push('');
  sections.push(
    table(
      ['类型', '文件数', '占解析成功'],
      [...profile.rootTypes.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => [type, number(count), percent(count, successful)]),
    ),
  );
  sections.push('');
  sections.push('解析失败类型（不包含文件名或原始内容）：');
  sections.push('');
  sections.push(
    table(
      ['失败类型', '数量'],
      [...profile.parseFailureKinds.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([kind, count]) => [kind, number(count)]),
    ),
  );

  sections.push('');
  sections.push('## 顶层字段分布');
  sections.push('');
  sections.push(
    table(
      ['字段', '出现文件数', '占根对象文件', '缺失文件数', '类型分布'],
      topLevel.map((field) => [
        markdownCode(field.path),
        number(field.fileIndexes.size),
        percent(field.fileIndexes.size, rootObjectFiles),
        number(Math.max(0, rootObjectFiles - field.occurrences)),
        typeSummary(field.types),
      ]),
    ),
  );

  sections.push('');
  sections.push('## 字段出现频率');
  sections.push('');
  sections.push('数组路径使用 `[]` 归一化；“父对象完整率”以该字段所在父对象实例数为分母。');
  sections.push('');
  sections.push(
    table(
      ['字段路径', '涉及文件', '字段实例', '父对象实例', '父对象完整率', '类型分布'],
      fields.map((field) => {
        const parentPopulation = profile.objectPopulations.get(field.parentPath) ?? 0;
        return [
          markdownCode(field.path),
          number(field.fileIndexes.size),
          number(field.occurrences),
          number(parentPopulation),
          percent(field.occurrences, parentPopulation),
          typeSummary(field.types),
        ];
      }),
    ),
  );

  const candidateTitles = {
    id: 'ID 字段候选',
    url: 'URL 字段候选',
    author: '作者字段候选',
    time: '时间字段候选',
    text: '文本字段候选',
  };

  for (const category of CATEGORIES) {
    sections.push('');
    sections.push(`## ${candidateTitles[category]}`);
    sections.push('');
    sections.push(
      table(
        ['字段路径', '涉及文件', '字段实例', '标量值', '空值', '父对象缺失', '类型分布'],
        candidateRows(category, profile).map((row) => [
          markdownCode(row.path),
          number(row.files),
          number(row.occurrences),
          number(row.values),
          number(row.blanks),
          number(row.missing),
          row.types,
        ]),
      ),
    );
  }

  sections.push('');
  sections.push('## 内容长度分布');
  sections.push('');
  sections.push('长度按 Unicode code point 统计，只覆盖“文本字段候选”中的字符串标量。');
  sections.push('');
  sections.push(
    table(
      ['样本数', '最小', '平均', 'P50', 'P90', 'P95', '最大'],
      [[
        number(lengths.count),
        number(lengths.min),
        number(lengths.mean),
        number(lengths.p50),
        number(lengths.p90),
        number(lengths.p95),
        number(lengths.max),
      ]],
    ),
  );
  sections.push('');
  sections.push(
    table(
      ['长度区间', '数量', '占文本样本'],
      LENGTH_BUCKETS.map((bucket) => {
        const count = profile.textLengths.filter(
          (length) => length >= bucket.min && length <= bucket.max,
        ).length;
        return [bucket.label, number(count), percent(count, lengths.count)];
      }),
    ),
  );
  sections.push('');
  sections.push('按字段：');
  sections.push('');
  sections.push(
    table(
      ['字段路径', '样本数', '平均', 'P50', 'P90', '最大'],
      [...profile.textLengthsByPath.entries()]
        .map(([path, values]) => ({ path, ...lengthSummary(values) }))
        .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
        .map((summary) => [
          markdownCode(summary.path),
          number(summary.count),
          number(summary.mean),
          number(summary.p50),
          number(summary.p90),
          number(summary.max),
        ]),
    ),
  );

  for (const category of ['id', 'url']) {
    const label = category === 'id' ? 'ID' : 'URL';
    const rows = candidateRows(category, profile);
    sections.push('');
    sections.push(`## 重复${label}`);
    sections.push('');
    sections.push('按字段内的非空、精确标量值统计；报告只展示计数，不展示值或哈希。');
    sections.push('');
    sections.push(
      table(
        ['字段路径', '非空值', '唯一值', '重复值组', '重复出现次数'],
        rows.map((row) => [
          markdownCode(row.path),
          number(row.values),
          number(row.hashes.size),
          number(row.groups),
          number(row.repeatedOccurrences),
        ]),
      ),
    );
  }

  sections.push('');
  sections.push('## 缺失字段统计');
  sections.push('');
  sections.push('顶层字段以成功解析的根对象文件为分母；嵌套字段以其父对象实例为分母。');
  sections.push('');
  sections.push('### 所有字段');
  sections.push('');
  sections.push(
    table(
      ['字段路径', '父对象实例', '出现', '缺失', '缺失率'],
      fields
        .map((field) => {
          const population = profile.objectPopulations.get(field.parentPath) ?? 0;
          return {
            path: field.path,
            population,
            occurrences: field.occurrences,
            missing: Math.max(0, population - field.occurrences),
          };
        })
        .sort(
          (left, right) =>
            right.missing / Math.max(1, right.population) -
              left.missing / Math.max(1, left.population) ||
            right.missing - left.missing ||
            left.path.localeCompare(right.path),
        )
        .map((row) => [
          markdownCode(row.path),
          number(row.population),
          number(row.occurrences),
          number(row.missing),
          percent(row.missing, row.population),
        ]),
    ),
  );
  sections.push('');
  sections.push('### 顶层字段');
  sections.push('');
  sections.push(
    table(
      ['字段路径', '应有对象', '缺失', '缺失率'],
      topLevel
        .map((field) => ({
          path: field.path,
          population: rootObjectFiles,
          missing: Math.max(0, rootObjectFiles - field.occurrences),
        }))
        .sort((left, right) => right.missing - left.missing || left.path.localeCompare(right.path))
        .map((row) => [
          markdownCode(row.path),
          number(row.population),
          number(row.missing),
          percent(row.missing, row.population),
        ]),
    ),
  );
  sections.push('');
  sections.push('### 候选字段');
  sections.push('');
  const missingCandidates = CATEGORIES.flatMap((category) =>
    candidateRows(category, profile).map((row) => ({ category, ...row })),
  ).sort(
    (left, right) =>
      right.missing - left.missing ||
      left.category.localeCompare(right.category) ||
      left.path.localeCompare(right.path),
  );
  sections.push(
    table(
      ['类别', '字段路径', '父对象实例', '缺失', '缺失率'],
      missingCandidates.map((row) => [
        row.category,
        markdownCode(row.path),
        number(row.parentPopulation),
        number(row.missing),
        percent(row.missing, row.parentPopulation),
      ]),
    ),
  );

  sections.push('');
  sections.push('## 统计口径');
  sections.push('');
  sections.push('- “涉及文件”表示至少出现一次该字段路径的成功解析文件数。');
  sections.push('- “字段实例”表示该字段在所有对象实例中的总出现次数。');
  sections.push('- ID/URL 重复按同一字段路径内的精确非空值计算，不跨字段合并。');
  sections.push('- 候选字段由字段名模式识别，不对正文含义、作者身份或时间语义作推断。');
  sections.push('- JSON 数字按 Node.js 原生 JSON 语义解析；超出安全整数范围的数字不保证原始十进制精度。');
  sections.push('');

  return sections.join('\n');
};

export const profileDataset = async ({ input, output }) => {
  const inputInfo = await stat(input);
  if (!inputInfo.isDirectory()) throw new Error('Input path is not a directory.');
  if (isWithin(input, output)) {
    throw new Error('Output path must be outside the read-only dataset directory.');
  }

  const inventory = await listJsonFiles(input);
  const profile = newProfile();

  for (let index = 0; index < inventory.files.length; index += 1) {
    const file = inventory.files[index];
    let raw;
    try {
      raw = await readFile(file, 'utf8');
      const info = await stat(file);
      profile.totalBytes += info.size;
      profile.fileSizes.push(info.size);
    } catch {
      profile.readFailure += 1;
      increment(profile.parseFailureKinds, 'read_error');
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      profile.parseSuccess += 1;
      profileDocument(parsed, index, profile);
    } catch (error) {
      profile.parseFailure += 1;
      increment(profile.parseFailureKinds, parseFailureKind(error));
    }
  }

  const report = buildReport({
    input,
    output,
    inventory,
    profile,
    generatedAt: new Date(),
  });
  await writeFile(output, report, 'utf8');

  return {
    files: inventory.files.length,
    parsed: profile.parseSuccess,
    failed: profile.parseFailure,
    readFailed: profile.readFailure,
    output,
  };
};

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await profileDataset(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown profiler error.';
    process.stderr.write(`Profiler failed: ${message}\n`);
    process.exitCode = 1;
  }
}
