/*
 * 合并发行版（Releases）的纯校验函数。
 * 不访问网络：传入 gh 返回的发行版 JSON 即可校验附件数量；
 * 传入 README / CHANGELOG 文本即可校验文档同步。
 */

const RELEASE_TYPES = [
  { type: 1, prefix: 'type1', label: '漫画' },
  { type: 2, prefix: 'type2', label: '动画' },
  { type: 3, prefix: 'type3', label: '音乐' },
  { type: 4, prefix: 'type4', label: '游戏' },
  { type: 6, prefix: 'type6', label: '三次元' },
];

const EXPECTED_ASSET_COUNT = RELEASE_TYPES.length * 3;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-11-24` → `261124`，用于差异文件名。 */
function toCompactDate(date) {
  const matched = DATE_PATTERN.exec(date);
  if (!matched) throw new Error(`日期格式不合法：${date}`);
  return matched[1].slice(2) + matched[2] + matched[3];
}

/** `2026-11-24` → `2026.11.24`，用于发行版 tag 与标题。 */
function toDottedDate(date) {
  if (!DATE_PATTERN.test(date)) throw new Error(`日期格式不合法：${date}`);
  return date.replaceAll('-', '.');
}

/** 单个合并发行版应包含的 15 个附件名（五类 × 主表 / 模板 / 差异）。 */
function buildAssetNames(date, previousDate) {
  const compact = toCompactDate(date);
  const previousCompact = toCompactDate(previousDate);
  return RELEASE_TYPES.flatMap(({ prefix }) => [
    `ani-bangumi-${prefix}-${date}.xlsx`,
    `ani-bangumi-${prefix}-${date}-template.xlsx`,
    `${prefix}_subject_${compact}_vs_${previousCompact}.xlsx`,
  ]);
}

function assetNameOf(asset) {
  return typeof asset === 'string' ? asset : asset.name;
}

function findMissingAssets(actualNames, expectedNames) {
  const actual = new Set(actualNames);
  return expectedNames.filter((name) => !actual.has(name));
}

function findUnexpectedAssets(actualNames, expectedNames) {
  const expected = new Set(expectedNames);
  return actualNames.filter((name) => !expected.has(name));
}

function findDuplicateAssets(actualNames) {
  const counts = new Map();
  for (const name of actualNames) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

/** 按类型统计附件数，便于断言「每类各 3 个」。 */
function countAssetsByType(actualNames) {
  const counts = {};
  for (const name of actualNames) {
    const matched = /^(?:ani-bangumi-(type\d)-|(type\d)_subject_)/.exec(name);
    if (!matched) continue;
    const prefix = matched[1] || matched[2];
    counts[prefix] = (counts[prefix] || 0) + 1;
  }
  return counts;
}

/** 校验一个合并发行版的 tag / 标题 / 状态 / 附件清单，返回问题列表。 */
function validateCombinedRelease(release, date, previousDate) {
  const problems = [];
  const expectedNames = buildAssetNames(date, previousDate);
  const actualNames = (release.assets || []).map(assetNameOf);
  const expectedTag = toDottedDate(date);

  if (release.tag !== expectedTag) problems.push(`tag 应为 ${expectedTag}，实际为 ${release.tag}`);
  if (release.name !== `wiki Excel-${expectedTag}`) {
    problems.push(`标题应为 wiki Excel-${expectedTag}，实际为 ${release.name}`);
  }
  if (release.isDraft) problems.push('发行版仍为草稿，尚未正式发布');

  if (actualNames.length !== EXPECTED_ASSET_COUNT) {
    problems.push(`附件数量应为 ${EXPECTED_ASSET_COUNT} 个，实际为 ${actualNames.length} 个`);
  }
  for (const name of findMissingAssets(actualNames, expectedNames)) {
    problems.push(`缺少附件：${name}`);
  }
  for (const name of findUnexpectedAssets(actualNames, expectedNames)) {
    problems.push(`多余附件：${name}`);
  }
  for (const name of findDuplicateAssets(actualNames)) {
    problems.push(`附件重复：${name}`);
  }
  return problems;
}

function isCombinedReleaseValid(release, date, previousDate) {
  return validateCombinedRelease(release, date, previousDate).length === 0;
}

const README_REQUIRED = [
  '一个合并发行版',
  '合计 15 个附件',
  'tag 为 `YYYY.MM.DD`',
  '2026-11-17 及更早',
  '保留不动',
  '统一为单个合并发行版',
  '`type1`',
  '`type2`',
  '`type3`',
  '`type4`',
  '`type6`',
];

const README_FORBIDDEN = ['按条目类型分开发布', 'manga-YYYY.MM.DD'];

/** README 的发行版说明必须已切换为合并版，且不再残留按类型发布的旧表述。 */
function isReadmeReleaseSectionSynced(readme) {
  return (
    README_REQUIRED.every((text) => readme.includes(text)) &&
    README_FORBIDDEN.every((text) => !readme.includes(text))
  );
}

const CHANGELOG_REQUIRED = ['合并发行版', '15 个', '2026-11-24'];

/** CHANGELOG 必须记录合并发行版的切换。 */
function isChangelogReleaseSynced(changelog) {
  return CHANGELOG_REQUIRED.every((text) => changelog.includes(text));
}

/** 汇总 README / CHANGELOG 的同步问题，便于测试直接断言空数组。 */
function findDocumentationProblems(readme, changelog) {
  const problems = [];
  for (const text of README_REQUIRED) {
    if (!readme.includes(text)) problems.push(`README 缺少：${text}`);
  }
  for (const text of README_FORBIDDEN) {
    if (readme.includes(text)) problems.push(`README 残留旧表述：${text}`);
  }
  for (const text of CHANGELOG_REQUIRED) {
    if (!changelog.includes(text)) problems.push(`CHANGELOG 缺少：${text}`);
  }
  return problems;
}

module.exports = {
  RELEASE_TYPES,
  EXPECTED_ASSET_COUNT,
  toCompactDate,
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
};
