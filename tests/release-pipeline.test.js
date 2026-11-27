const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  RELEASE_TYPES,
  EXPECTED_ASSET_COUNT,
  toDottedDate,
  buildAssetNames,
  findMissingAssets,
  findUnexpectedAssets,
  findDuplicateAssets,
  countAssetsByType,
  validateCombinedRelease,
  isCombinedReleaseValid,
  isReadmeReleaseSectionSynced,
  isChangelogReleaseSynced,
  findDocumentationProblems,
} = require('./release-pipeline.js');

const root = path.resolve(__dirname, '..');
const DATE = '2026-11-24';
const PREVIOUS_DATE = '2026-11-17';

function read(fileName) {
  return fs.readFileSync(path.join(root, fileName), 'utf8');
}

function makeRelease(overrides = {}) {
  return {
    tag: toDottedDate(DATE),
    name: `wiki Excel-${toDottedDate(DATE)}`,
    isDraft: false,
    assets: buildAssetNames(DATE, PREVIOUS_DATE).map((name) => ({ name })),
    ...overrides,
  };
}

/* ---------------------------- 文档同步校验 ---------------------------- */

test('文档：README 发行版说明已切换为合并版', () => {
  assert.ok(isReadmeReleaseSectionSynced(read('README.md')));
});

test('文档：CHANGELOG 已记录合并发行版切换', () => {
  assert.ok(isChangelogReleaseSynced(read('CHANGELOG.md')));
});

test('文档：README 与 CHANGELOG 同步问题为空', () => {
  assert.deepEqual(findDocumentationProblems(read('README.md'), read('CHANGELOG.md')), []);
});

test('文档边界：README 缺少附件总数说明时判定失败', () => {
  const readme = read('README.md').replace('（合计 15 个附件）', '');
  assert.equal(isReadmeReleaseSectionSynced(readme), false);
  assert.ok(findDocumentationProblems(readme, read('CHANGELOG.md')).some((item) => item.includes('合计 15 个附件')));
});

test('文档边界：README 残留按类型发布的旧表述时判定失败', () => {
  const readme = read('README.md') + '\n本项目的 Releases 页面按条目类型分开发布。';
  assert.equal(isReadmeReleaseSectionSynced(readme), false);
  assert.ok(findDocumentationProblems(readme, read('CHANGELOG.md')).some((item) => item.includes('残留旧表述')));
});

test('文档边界：README 缺少历史拆分说明时判定失败', () => {
  const readme = read('README.md').replace('2026-11-17 及更早', '此前');
  assert.equal(isReadmeReleaseSectionSynced(readme), false);
});

test('文档边界：README 缺少某个 type 前缀时判定失败', () => {
  const readme = read('README.md').replace('`type6`', '`typeX`');
  assert.equal(isReadmeReleaseSectionSynced(readme), false);
});

test('文档边界：CHANGELOG 缺少合并版说明时判定失败', () => {
  const changelog = read('CHANGELOG.md').replace('合并发行版', '发行版');
  assert.equal(isChangelogReleaseSynced(changelog), false);
  assert.ok(findDocumentationProblems(read('README.md'), changelog).some((item) => item.includes('CHANGELOG')));
});

/* ---------------------------- 附件清单构建 ---------------------------- */

test('附件：合并发行版固定为 15 个且无重复', () => {
  const names = buildAssetNames(DATE, PREVIOUS_DATE);
  assert.equal(names.length, EXPECTED_ASSET_COUNT);
  assert.equal(new Set(names).size, EXPECTED_ASSET_COUNT);
});

test('附件：五类各三件（主表 / 模板 / 差异）', () => {
  const counts = countAssetsByType(buildAssetNames(DATE, PREVIOUS_DATE));
  for (const { prefix } of RELEASE_TYPES) {
    assert.equal(counts[prefix], 3, `${prefix} 应有 3 个附件`);
  }
  assert.deepEqual(Object.keys(counts).sort(), RELEASE_TYPES.map(({ prefix }) => prefix).sort());
});

test('附件：命名符合主表 / 模板 / 差异三种约定', () => {
  const names = buildAssetNames(DATE, PREVIOUS_DATE);
  assert.ok(names.includes('ani-bangumi-type2-2026-11-24.xlsx'));
  assert.ok(names.includes('ani-bangumi-type2-2026-11-24-template.xlsx'));
  assert.ok(names.includes('type2_subject_261124_vs_261117.xlsx'));
  assert.ok(names.includes('ani-bangumi-type1-2026-11-24.xlsx'));
  assert.ok(names.includes('ani-bangumi-type6-2026-11-24.xlsx'));
});

test('附件：日期格式非法时抛错', () => {
  assert.throws(() => buildAssetNames('2026/11/24', PREVIOUS_DATE), /日期格式不合法/);
  assert.throws(() => buildAssetNames(DATE, '261117'), /日期格式不合法/);
});

test('附件边界：缺少一个文件时能被定位', () => {
  const expected = buildAssetNames(DATE, PREVIOUS_DATE);
  const actual = expected.filter((name) => !name.includes('type4_subject'));
  assert.deepEqual(findMissingAssets(actual, expected), ['type4_subject_261124_vs_261117.xlsx']);
});

test('附件边界：多余文件会被列出', () => {
  const expected = buildAssetNames(DATE, PREVIOUS_DATE);
  assert.deepEqual(findUnexpectedAssets([...expected, 'extra.zip'], expected), ['extra.zip']);
});

test('附件边界：重复文件会被识别', () => {
  const expected = buildAssetNames(DATE, PREVIOUS_DATE);
  assert.deepEqual(findDuplicateAssets([...expected, expected[0]]), [expected[0]]);
});

/* --------------------------- 发行版整体校验 --------------------------- */

test('发行版：15 个附件的合并版校验通过', () => {
  assert.deepEqual(validateCombinedRelease(makeRelease(), DATE, PREVIOUS_DATE), []);
  assert.equal(isCombinedReleaseValid(makeRelease(), DATE, PREVIOUS_DATE), true);
});

test('发行版边界：附件只有 14 个时校验失败并报出缺失项', () => {
  const release = makeRelease({ assets: buildAssetNames(DATE, PREVIOUS_DATE).slice(0, 14) });
  const problems = validateCombinedRelease(release, DATE, PREVIOUS_DATE);
  assert.ok(problems.some((item) => item.includes('附件数量应为 15 个')));
  assert.ok(problems.some((item) => item.includes('缺少附件')));
});

test('发行版边界：草稿状态校验失败', () => {
  const problems = validateCombinedRelease(makeRelease({ isDraft: true }), DATE, PREVIOUS_DATE);
  assert.ok(problems.some((item) => item.includes('草稿')));
});

test('发行版边界：tag 未使用 YYYY.MM.DD 时校验失败', () => {
  const problems = validateCombinedRelease(makeRelease({ tag: '2026.11.24-draft' }), DATE, PREVIOUS_DATE);
  assert.ok(problems.some((item) => item.includes('tag')));
});

test('发行版边界：标题不匹配时校验失败', () => {
  const problems = validateCombinedRelease(makeRelease({ name: 'wiki Excel-2026.11.24 合并版' }), DATE, PREVIOUS_DATE);
  assert.ok(problems.some((item) => item.includes('标题')));
});

test('发行版边界：混入旧分类发行版的附件时校验失败', () => {
  const release = makeRelease({
    assets: [...buildAssetNames(DATE, PREVIOUS_DATE), { name: 'ani-bangumi-type1-2026-11-17.xlsx' }],
  });
  const problems = validateCombinedRelease(release, DATE, PREVIOUS_DATE);
  assert.ok(problems.some((item) => item.includes('附件数量应为 15 个')));
  assert.ok(problems.some((item) => item.includes('多余附件')));
});
