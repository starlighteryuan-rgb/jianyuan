# Zhihu Dataset Profile

## 扫描边界

- 实际数据目录：`<local_dataset_path>`
- 报告文件：`<project_root>/docs/zhihu-dataset-profile.md`
- 生成时间：2026-09-12T20:52:30.038Z
- 扫描方式：递归、逐文件、一次只解析一个 JSON。
- 数据处理：不联网、不上传、不调用 Domain/Ingestion/ExternalReference，不创建 Record。
- 隐私处理：报告不包含原始正文、作者值、ID 值或 URL 值；重复统计只保留 SHA-256 哈希计数。

## 文件与解析结果

| 指标 | 数量 |
| --- | --- |
| JSON 文件 | 834 |
| 解析成功 | 834 |
| 解析失败 | 0 |
| 读取失败 | 0 |
| 非 JSON 文件（未读取） | 0 |
| 符号链接（未跟随） | 0 |
| 总字节数 | 23,386,860 |

根值类型：

| 类型 | 文件数 | 占解析成功 |
| --- | --- | --- |
| object | 834 | 100.00% |

解析失败类型（不包含文件名或原始内容）：

| 失败类型 | 数量 |
| --- | --- |
| - | - |

## 顶层字段分布

| 字段 | 出现文件数 | 占根对象文件 | 缺失文件数 | 类型分布 |
| --- | --- | --- | --- | --- |
| `$.Code` | 834 | 100.00% | 0 | number:834 |
| `$.Data` | 834 | 100.00% | 0 | object:834 |
| `$.Message` | 834 | 100.00% | 0 | string:834 |

## 字段出现频率

数组路径使用 `[]` 归一化；“父对象完整率”以该字段所在父对象实例数为分母。

| 字段路径 | 涉及文件 | 字段实例 | 父对象实例 | 父对象完整率 | 类型分布 |
| --- | --- | --- | --- | --- | --- |
| `$.Data.Items[].AuthorAvatar` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].AuthorBadge` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].AuthorBadgeText` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].AuthorityLevel` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].AuthorName` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].CommentCount` | 833 | 8,330 | 8,330 | 100.00% | number:8,330 |
| `$.Data.Items[].ContentID` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].ContentText` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].ContentType` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].EditTime` | 833 | 8,330 | 8,330 | 100.00% | number:8,330 |
| `$.Data.Items[].RankingScore` | 833 | 8,330 | 8,330 | 100.00% | number:8,330 |
| `$.Data.Items[].Title` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].Url` | 833 | 8,330 | 8,330 | 100.00% | string:8,330 |
| `$.Data.Items[].VoteUpCount` | 833 | 8,330 | 8,330 | 100.00% | number:8,330 |
| `$.Data.Items[].AuthorSignature` | 833 | 8,122 | 8,330 | 97.50% | string:8,122 |
| `$.Data.Items[].CommentInfoList[].Content` | 818 | 8,108 | 8,108 | 100.00% | string:8,108 |
| `$.Data.Items[].CommentInfoList` | 818 | 3,493 | 8,330 | 41.93% | array:3,493 |
| `$.Code` | 834 | 834 | 834 | 100.00% | number:834 |
| `$.Data` | 834 | 834 | 834 | 100.00% | object:834 |
| `$.Data.HasMore` | 834 | 834 | 834 | 100.00% | boolean:834 |
| `$.Data.Items` | 834 | 834 | 834 | 100.00% | array:834 |
| `$.Data.SearchHashId` | 834 | 834 | 834 | 100.00% | string:834 |
| `$.Message` | 834 | 834 | 834 | 100.00% | string:834 |
| `$.Data.EmptyReason` | 1 | 1 | 834 | 0.12% | string:1 |

## ID 字段候选

| 字段路径 | 涉及文件 | 字段实例 | 标量值 | 空值 | 父对象缺失 | 类型分布 |
| --- | --- | --- | --- | --- | --- | --- |
| `$.Data.Items[].ContentID` | 833 | 8,330 | 8,330 | 0 | 0 | string:8,330 |
| `$.Data.SearchHashId` | 834 | 834 | 834 | 0 | 0 | string:834 |

## URL 字段候选

| 字段路径 | 涉及文件 | 字段实例 | 标量值 | 空值 | 父对象缺失 | 类型分布 |
| --- | --- | --- | --- | --- | --- | --- |
| `$.Data.Items[].AuthorAvatar` | 833 | 8,330 | 8,330 | 0 | 0 | string:8,330 |
| `$.Data.Items[].AuthorBadge` | 833 | 8,330 | 1,321 | 7,009 | 0 | string:8,330 |
| `$.Data.Items[].Url` | 833 | 8,330 | 8,330 | 0 | 0 | string:8,330 |

## 作者字段候选

| 字段路径 | 涉及文件 | 字段实例 | 标量值 | 空值 | 父对象缺失 | 类型分布 |
| --- | --- | --- | --- | --- | --- | --- |
| `$.Data.Items[].AuthorAvatar` | 833 | 8,330 | 8,330 | 0 | 0 | string:8,330 |
| `$.Data.Items[].AuthorBadge` | 833 | 8,330 | 1,321 | 7,009 | 0 | string:8,330 |
| `$.Data.Items[].AuthorBadgeText` | 833 | 8,330 | 1,321 | 7,009 | 0 | string:8,330 |
| `$.Data.Items[].AuthorName` | 833 | 8,330 | 6,860 | 1,470 | 0 | string:8,330 |
| `$.Data.Items[].AuthorSignature` | 833 | 8,122 | 8,122 | 0 | 208 | string:8,122 |

## 时间字段候选

| 字段路径 | 涉及文件 | 字段实例 | 标量值 | 空值 | 父对象缺失 | 类型分布 |
| --- | --- | --- | --- | --- | --- | --- |
| `$.Data.Items[].EditTime` | 833 | 8,330 | 8,330 | 0 | 0 | number:8,330 |

## 文本字段候选

| 字段路径 | 涉及文件 | 字段实例 | 标量值 | 空值 | 父对象缺失 | 类型分布 |
| --- | --- | --- | --- | --- | --- | --- |
| `$.Data.Items[].ContentText` | 833 | 8,330 | 8,330 | 0 | 0 | string:8,330 |
| `$.Data.Items[].Title` | 833 | 8,330 | 8,330 | 0 | 0 | string:8,330 |
| `$.Data.Items[].CommentInfoList[].Content` | 818 | 8,108 | 8,108 | 0 | 0 | string:8,108 |

## 内容长度分布

长度按 Unicode code point 统计，只覆盖“文本字段候选”中的字符串标量。

| 样本数 | 最小 | 平均 | P50 | P90 | P95 | 最大 |
| --- | --- | --- | --- | --- | --- | --- |
| 24,768 | 1 | 259.04 | 37 | 1,014 | 1,040 | 4,199 |

| 长度区间 | 数量 | 占文本样本 |
| --- | --- | --- |
| 0 | 0 | 0.00% |
| 1-50 | 13,915 | 56.18% |
| 51-200 | 2,710 | 10.94% |
| 201-500 | 2,504 | 10.11% |
| 501-1,000 | 2,979 | 12.03% |
| 1,001-5,000 | 2,660 | 10.74% |
| >5,000 | 0 | 0.00% |

按字段：

| 字段路径 | 样本数 | 平均 | P50 | P90 | 最大 |
| --- | --- | --- | --- | --- | --- |
| `$.Data.Items[].ContentText` | 8,330 | 692.73 | 697 | 1,049 | 4,199 |
| `$.Data.Items[].Title` | 8,330 | 26.44 | 25 | 39 | 103 |
| `$.Data.Items[].CommentInfoList[].Content` | 8,108 | 52.43 | 26 | 115 | 3,393 |

## 重复ID

按字段内的非空、精确标量值统计；报告只展示计数，不展示值或哈希。

| 字段路径 | 非空值 | 唯一值 | 重复值组 | 重复出现次数 |
| --- | --- | --- | --- | --- |
| `$.Data.Items[].ContentID` | 8,330 | 8,050 | 252 | 280 |
| `$.Data.SearchHashId` | 834 | 834 | 0 | 0 |

## 重复URL

按字段内的非空、精确标量值统计；报告只展示计数，不展示值或哈希。

| 字段路径 | 非空值 | 唯一值 | 重复值组 | 重复出现次数 |
| --- | --- | --- | --- | --- |
| `$.Data.Items[].AuthorAvatar` | 8,330 | 5,566 | 481 | 2,764 |
| `$.Data.Items[].AuthorBadge` | 1,321 | 16 | 15 | 1,305 |
| `$.Data.Items[].Url` | 8,330 | 8,050 | 252 | 280 |

## 缺失字段统计

顶层字段以成功解析的根对象文件为分母；嵌套字段以其父对象实例为分母。

### 所有字段

| 字段路径 | 父对象实例 | 出现 | 缺失 | 缺失率 |
| --- | --- | --- | --- | --- |
| `$.Data.EmptyReason` | 834 | 1 | 833 | 99.88% |
| `$.Data.Items[].CommentInfoList` | 8,330 | 3,493 | 4,837 | 58.07% |
| `$.Data.Items[].AuthorSignature` | 8,330 | 8,122 | 208 | 2.50% |
| `$.Code` | 834 | 834 | 0 | 0.00% |
| `$.Data` | 834 | 834 | 0 | 0.00% |
| `$.Data.HasMore` | 834 | 834 | 0 | 0.00% |
| `$.Data.Items` | 834 | 834 | 0 | 0.00% |
| `$.Data.Items[].AuthorAvatar` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].AuthorBadge` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].AuthorBadgeText` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].AuthorityLevel` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].AuthorName` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].CommentCount` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].CommentInfoList[].Content` | 8,108 | 8,108 | 0 | 0.00% |
| `$.Data.Items[].ContentID` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].ContentText` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].ContentType` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].EditTime` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].RankingScore` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].Title` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].Url` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.Items[].VoteUpCount` | 8,330 | 8,330 | 0 | 0.00% |
| `$.Data.SearchHashId` | 834 | 834 | 0 | 0.00% |
| `$.Message` | 834 | 834 | 0 | 0.00% |

### 顶层字段

| 字段路径 | 应有对象 | 缺失 | 缺失率 |
| --- | --- | --- | --- |
| `$.Code` | 834 | 0 | 0.00% |
| `$.Data` | 834 | 0 | 0.00% |
| `$.Message` | 834 | 0 | 0.00% |

### 候选字段

| 类别 | 字段路径 | 父对象实例 | 缺失 | 缺失率 |
| --- | --- | --- | --- | --- |
| author | `$.Data.Items[].AuthorSignature` | 8,330 | 208 | 2.50% |
| author | `$.Data.Items[].AuthorAvatar` | 8,330 | 0 | 0.00% |
| author | `$.Data.Items[].AuthorBadge` | 8,330 | 0 | 0.00% |
| author | `$.Data.Items[].AuthorBadgeText` | 8,330 | 0 | 0.00% |
| author | `$.Data.Items[].AuthorName` | 8,330 | 0 | 0.00% |
| id | `$.Data.Items[].ContentID` | 8,330 | 0 | 0.00% |
| id | `$.Data.SearchHashId` | 834 | 0 | 0.00% |
| text | `$.Data.Items[].CommentInfoList[].Content` | 8,108 | 0 | 0.00% |
| text | `$.Data.Items[].ContentText` | 8,330 | 0 | 0.00% |
| text | `$.Data.Items[].Title` | 8,330 | 0 | 0.00% |
| time | `$.Data.Items[].EditTime` | 8,330 | 0 | 0.00% |
| url | `$.Data.Items[].AuthorAvatar` | 8,330 | 0 | 0.00% |
| url | `$.Data.Items[].AuthorBadge` | 8,330 | 0 | 0.00% |
| url | `$.Data.Items[].Url` | 8,330 | 0 | 0.00% |

## 统计口径

- “涉及文件”表示至少出现一次该字段路径的成功解析文件数。
- “字段实例”表示该字段在所有对象实例中的总出现次数。
- ID/URL 重复按同一字段路径内的精确非空值计算，不跨字段合并。
- 候选字段由字段名模式识别，不对正文含义、作者身份或时间语义作推断。
- JSON 数字按 Node.js 原生 JSON 语义解析；超出安全整数范围的数字不保证原始十进制精度。
