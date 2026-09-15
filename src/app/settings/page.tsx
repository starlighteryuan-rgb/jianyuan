import {
  refreshAIModels,
  saveAIProviderSettings,
  selectAIModel,
  testAIConnection,
} from '../actions/ai-settings';
import { restoreData } from '../actions/data-settings';
import { createDirective, revokeDirective } from '../actions/directives';
import { updateReflectionInvitationPermission } from '../actions/preferences';
import type {
  Directive,
  ReflectionPreference,
} from '../../../packages/core/index';
import { getAISettingsRuntime } from '@/server/ai-settings-runtime';
import { getCoreComposition } from '@/server/capture-composition-root';
import { getDataSettingsSnapshot } from '@/server/data-settings';

export const dynamic = 'force-dynamic';

const RESTORE_MESSAGES: Readonly<Record<string, string>> = {
  'confirmation-required': '请先确认你理解恢复操作会替换当前本地数据。',
  'file-required': '请选择一个见渊 JSON 备份文件。',
  'file-too-large': '备份文件超过 20 MB，未执行恢复。',
  'invalid-backup': '文件不是当前版本可识别的见渊备份，未修改数据。',
  complete: '恢复完成。本地记录、长期联系和理解已重新载入。',
};

const permissionWord = (allowed: boolean): string =>
  allowed ? '允许' : '不允许';

const aiStatusLabel = (status: string): string => ({
  unconfigured: '未配置',
  connected: '已连接',
  unavailable: '暂时不可用',
}[status] ?? status);

const connectionStatusLabel = (status: string): string => ({
  connected: '已连接',
  authentication_failed: '凭据未通过验证',
  endpoint_invalid: '服务地址无效',
  model_unavailable: '模型不可用',
  timeout: '连接超时',
  rate_limited: '请求过于频繁',
  provider_error: '服务暂时出错',
  not_configured: '尚未配置',
}[status] ?? status);

const dataModeLabel = (mode: string): string => ({
  sqlite: '本地数据库',
  memory: '临时内存',
  unavailable: '暂不可用',
}[mode] ?? mode);

interface SettingsPageProps {
  readonly searchParams?: Promise<{
    readonly restore?: string | readonly string[];
  }>;
}

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  const ai = getAISettingsRuntime().snapshot();
  const data = await getDataSettingsSnapshot();
  let directives: readonly Directive[] = [];
  let preference: ReflectionPreference | null = null;
  let permissionsAvailable = true;

  try {
    const core = await getCoreComposition();
    [directives, preference] = await Promise.all([
      core.directives.listActive(),
      core.reflection.preference(new Date()),
    ]);
  } catch {
    permissionsAvailable = false;
  }

  const params = await searchParams;
  const restoreCode = Array.isArray(params?.restore)
    ? params.restore[0]
    : params?.restore;
  const restoreMessage =
    restoreCode === undefined ? undefined : RESTORE_MESSAGES[restoreCode];

  return (
    <main className="settings-workbench">
      <header className="settings-hero">
        <p className="settings-kicker">设置</p>
        <h1>让 AI 有能力，也有边界。</h1>
        <p>
          在这里管理 AI 服务、数据与隐私边界。日常记录和回看不会被设置打断。
        </p>
      </header>

      <aside className="settings-index" aria-label="设置分区">
        <span className="settings-index-label">本机运行状态</span>
        <a href="#provider">01 / AI 服务</a>
        <a href="#permissions">02 / 数据与 AI 使用规则</a>
        <a href="#data">03 / 本地数据</a>
        <dl>
          <div>
            <dt>AI 服务</dt>
            <dd data-tone={ai.status}>{aiStatusLabel(ai.status)}</dd>
          </div>
          <div>
            <dt>本地数据</dt>
            <dd>{dataModeLabel(data.mode)}</dd>
          </div>
        </dl>
      </aside>

      <div className="settings-sections">
        <section className="settings-section" id="provider">
          <div className="settings-section-head">
            <div>
              <span>01</span>
              <h2>AI 服务</h2>
            </div>
            <span className="settings-status" data-tone={ai.status}>
              {aiStatusLabel(ai.status)}
            </span>
          </div>
          <p className="settings-status-copy" role="status">
            {ai.statusMessage}
          </p>
          <p className="settings-status-copy">
            连接状态：{connectionStatusLabel(ai.connectionStatus)}
          </p>

          <form action={saveAIProviderSettings} className="settings-form">
            <label className="settings-switch">
              <input type="checkbox" name="enabled" defaultChecked={ai.enabled} />
              <span>
                <strong>使用 AI 服务</strong>
                <small>关闭时不会向 AI 服务发送个人数据。</small>
              </span>
            </label>

            <div className="settings-field-grid">
              <label>
                服务标识
                <input
                  name="providerId"
                  defaultValue={ai.providerId}
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                Base URL
                <input
                  type="url"
                  name="baseUrl"
                  defaultValue={ai.baseUrl}
                  placeholder="https://provider.example/v1"
                  autoComplete="url"
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  name="apiKey"
                  placeholder={
                    ai.apiKeyConfigured
                      ? '当前进程已配置；留空保持不变'
                      : '仅保存在当前服务进程'
                  }
                  autoComplete="new-password"
                />
              </label>
              <label>
                模型标识
                <input
                  name="model"
                  defaultValue={ai.model}
                  list="discovered-models"
                  placeholder="手工输入或从发现结果选择"
                  autoComplete="off"
                />
              </label>
            </div>
            <datalist id="discovered-models">
              {ai.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName ?? model.id}
                </option>
              ))}
            </datalist>
            <div className="settings-actions">
              <button className="primary" type="submit">
                保存 AI 服务设置
              </button>
            </div>
          </form>

          <div className="settings-command-row">
            <form action={testAIConnection}>
              <button type="submit">测试连接</button>
            </form>
            <form action={refreshAIModels}>
              <button type="submit">获取模型列表</button>
            </form>
            <span>
              {ai.modelDiscoverySupported === null
                ? '尚未获取模型列表'
                : ai.modelDiscoverySupported
                  ? ai.models.length + ' 个模型 · ' + (ai.discoverySource === 'cache' ? '本地缓存' : '服务返回')
                  : '当前服务不提供模型列表，可手工填写'}
            </span>
          </div>

          {ai.models.length > 0 ? (
            <form action={selectAIModel} className="settings-model-picker">
            <label htmlFor="model-selection">可选择的模型</label>
              <select
                id="model-selection"
                name="model"
                defaultValue={ai.model}
              >
                <option value="">选择模型</option>
                {ai.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName ?? model.id}
                  </option>
                ))}
              </select>
              <button type="submit">使用此模型</button>
            </form>
          ) : null}

          <p className="settings-boundary-note">
            API Key 只交给已配置的 AI 服务，不写入本地数据库。页面本身不直接连接 AI 服务。
          </p>
        </section>

        <section className="settings-section" id="permissions">
          <div className="settings-section-head">
            <div>
              <span>02</span>
              <h2>数据与 AI 使用规则</h2>
            </div>
            <span className="settings-status">
              {permissionsAvailable
                ? directives.length + ' 条已启用'
                : '暂不可用'}
            </span>
          </div>
          <p className="settings-section-intro">
            AI 只接收明确选择的记录；下面的规则决定它能回看什么、何时出现。
          </p>

          {permissionsAvailable ? (
            <>
              <div className="settings-rule-list">
                {directives.length === 0 ? (
                  <div className="settings-empty">
                    当前没有主动添加的规则。系统使用默认权限边界。
                  </div>
                ) : (
                  directives.map((directive) => (
                    <article key={directive.id} className="settings-rule">
                      <div>
                        <span className="settings-rule-scope">
                          {directive.scope === null
                            ? '全局 / 已存在资料'
                            : directive.scope.kind + ': ' + directive.scope.value}
                        </span>
                        <strong>
                          允许 AI 回看：
                          {permissionWord(directive.allowAnalysis)}
                        </strong>
                        <small>
                          保存记录 {permissionWord(directive.allowStorage)} · 查看时呈现{' '}
                          {permissionWord(directive.allowPassivePresentation)} · 主动提示{' '}
                          {permissionWord(directive.allowProactivePresentation)}
                        </small>
                      </div>
                      <form action={revokeDirective}>
                        <input type="hidden" name="id" value={directive.id} />
                        <button type="submit">撤销</button>
                      </form>
                    </article>
                  ))
                )}
              </div>

              <form action={createDirective} className="settings-form">
                <fieldset className="settings-permission-set">
                  <legend>新增一条明确规则</legend>
                  <div className="settings-check-grid">
                    <label>
                      <input type="checkbox" name="allowAnalysis" />
                      允许 AI 回看
                    </label>
                    <label>
                      <input type="checkbox" name="allowStorage" defaultChecked />
                      允许保存记录
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="allowPassivePresentation"
                        defaultChecked
                      />
                      允许在我查看时呈现
                    </label>
                    <label>
                      <input type="checkbox" name="allowProactivePresentation" />
                      允许主动呈现
                    </label>
                  </div>
                  <div className="settings-field-grid">
                    <label>
                      AI 可访问的数据范围
                      <select name="scopeKind" defaultValue="">
                        <option value="">全局（仅当前已有资料）</option>
                        <option value="topic_tag">主题 / 标签</option>
                        <option value="source">来源</option>
                        <option value="relation_axis">联系方向</option>
                        <option value="user_selected">我选择的记录</option>
                      </select>
                    </label>
                    <label>
                      范围值
                      <input
                        name="scopeValue"
                        placeholder="选择范围类型时必须填写"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <label className="settings-switch settings-switch-compact">
                    <input type="checkbox" name="appliesToFutureSimilar" />
                    <span>
                      <strong>也适用于未来同范围资料</strong>
                      <small>必须同时填写明确的范围类型和值，Core 不推断“相似”。</small>
                    </span>
                  </label>
                  <div className="settings-actions">
                    <button className="primary" type="submit">
                      保存为使用规则
                    </button>
                  </div>
                </fieldset>
              </form>

              <form
                action={updateReflectionInvitationPermission}
                className="settings-invitation-row"
              >
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    name="allowReflectionInvitation"
                    defaultChecked={preference?.interventionLevel === 'standard'}
                  />
                  <span>
                    <strong>允许回看问题</strong>
                    <small>
                      开启后，觉察空间可以向你提出回看问题；关闭后只保留主动发起的回看。
                    </small>
                  </span>
                </label>
                <button type="submit">保存邀请偏好</button>
              </form>
            </>
          ) : (
            <div className="settings-empty">数据与 AI 使用规则暂时无法读取。</div>
          )}
        </section>

        <section className="settings-section" id="data">
          <div className="settings-section-head">
            <div>
              <span>03</span>
              <h2>本地数据</h2>
            </div>
            <span
              className="settings-status"
              data-tone={data.available ? 'connected' : 'error'}
            >
              {data.available ? '已连接' : dataModeLabel(data.mode)}
            </span>
          </div>

          {restoreMessage === undefined ? null : (
            <p className="settings-status-copy" role="status">
              {restoreMessage}
            </p>
          )}

          <dl className="settings-data-facts">
            <div>
              <dt>保存方式</dt>
              <dd>{dataModeLabel(data.mode)}</dd>
            </div>
            <div>
              <dt>数据版本</dt>
              <dd>
                {data.schemaVersion === null ? '—' : 'v' + data.schemaVersion}
              </dd>
            </div>
            <div>
              <dt>应用层保护</dt>
              <dd>
                {data.encryptionConfigured
                  ? data.encryptionControllerId
                  : '未配置应用层控制器'}
              </dd>
            </div>
            <div>
              <dt>设备级加密</dt>
              <dd>{data.deviceLevelEncryptionVerified ? '已验证' : '未完成'}</dd>
            </div>
          </dl>
          <p className="settings-path">
            <span>本地数据库路径</span>
            <code>{data.databasePath ?? '当前保存方式不是 SQLite'}</code>
          </p>

          <div className="settings-data-actions">
            {data.available ? (
              <a className="settings-download" href="/api/settings/export" download>
                导出数据
              </a>
            ) : (
              <span className="settings-disabled-action">暂时无法导出</span>
            )}
              <span>导出的是当前本地数据的逻辑备份。</span>
          </div>

          <form
            action={restoreData}
            className="settings-restore"
          >
            <label>
              恢复备份
              <input
                type="file"
                name="backup"
                accept="application/json,.json"
                required
                disabled={!data.available}
              />
            </label>
            <label className="settings-danger-check">
              <input
                type="checkbox"
                name="confirmRestore"
                disabled={!data.available}
              />
              我理解恢复备份会用备份内容替换当前本地数据
            </label>
            <button type="submit" disabled={!data.available}>
              恢复数据
            </button>
          </form>
          <p className="settings-boundary-note">
            恢复由现有本地数据适配器在事务中完成。页面没有改变数据结构。
          </p>
        </section>
      </div>
    </main>
  );
}
