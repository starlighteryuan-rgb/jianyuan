import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  deleteAPIKey,
  getAppDataPath,
  getSecretStatus,
  runtimeRequest,
  storeAPIKey,
  type SecretStatus,
} from './api';
import type { ThemePreference } from './theme';
import { useThemePreference } from './use-theme-preference';

interface AIStatus {
  readonly status: 'unconfigured' | 'connected' | 'unavailable';
  readonly connectionStatus:
    | 'connected'
    | 'authentication_failed'
    | 'endpoint_invalid'
    | 'model_unavailable'
    | 'timeout'
    | 'rate_limited'
    | 'provider_error'
    | 'not_configured';
  readonly message: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKeyConfigured: boolean;
  readonly models: readonly { readonly id: string; readonly displayName?: string }[];
  readonly modelDiscoverySupported: boolean | null;
  readonly discoverySource: 'upstream' | 'cache' | 'disabled' | null;
}

interface RuntimeStatus {
  readonly product: string;
  readonly databasePath: string;
  readonly schemaVersion: number;
  readonly encryption: {
    readonly configured: boolean;
    readonly controllerId: string | null;
    readonly deviceLevelVerified: false;
  };
  readonly ai: AIStatus;
}

interface RecordView {
  readonly id: string;
  readonly verbatim: string | null;
  readonly createdAt: string;
}

interface RelationSuggestion {
  readonly kind: 'relation_candidate';
  readonly recordRefs: readonly string[];
  readonly comparisonAxis: { readonly question: string; readonly dimension: string };
  readonly relationType: string;
  readonly evidenceSummary: string;
  readonly assertsTemporalOrdering: boolean;
}

type ObservationMeaning =
  | 'connected'
  | 'different_understanding'
  | 'not_my_experience';

const connectionStatusLabel = (status: AIStatus['connectionStatus'] | undefined): string => ({
  connected: '已连接',
  authentication_failed: '凭据未通过验证',
  endpoint_invalid: '服务地址无效',
  model_unavailable: '模型不可用',
  timeout: '连接超时',
  rate_limited: '请求过于频繁',
  provider_error: '服务暂时出错',
  not_configured: '尚未配置',
}[status ?? 'not_configured'] ?? '暂不可用');

const aiStatusLabel = (status: AIStatus['status'] | undefined): string => ({
  connected: '已连接',
  unavailable: '暂时不可用',
  unconfigured: '未配置',
}[status ?? 'unconfigured'] ?? '暂不可用');

type DesktopSpace = 'records' | 'awareness' | 'reflection' | 'exploration' | 'settings';

const DESKTOP_SPACES: readonly {
  readonly id: DesktopSpace;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: 'records', label: '记录', description: '我经历了什么' },
  { id: 'awareness', label: '觉察', description: '有什么值得重新观察' },
  { id: 'reflection', label: '理解', description: '我如何理解这些经历' },
  { id: 'exploration', label: '探索', description: '长期来看值得关注什么' },
  { id: 'settings', label: '设置', description: '服务、数据与隐私' },
];

const DESKTOP_SPACE_COPY: Readonly<
  Record<DesktopSpace, { readonly title: string; readonly description: string }>
> = {
  records: {
    title: '先留下自己的经历。',
    description: '记录属于事实层。先保存你愿意留下的原话，再决定是否要回看。',
  },
  awareness: {
    title: '回看一些可能的联系。',
    description: 'AI 只提供临时观察。相关记录和不确定性会留在这里，是否有意义由你决定。',
  },
  reflection: {
    title: '把你的理解留在这里。',
    description: '这里属于你写下的理解。AI 的观察只是背景，不会替你定义经历。',
  },
  exploration: {
    title: '探索已经形成的长期联系。',
    description: '只回看经过你参与后形成的联系，不生成关于你的画像或结论。',
  },
  settings: {
    title: '管理服务、数据与边界。',
    description: 'AI 服务、凭据和本地数据控制都在这里，日常记录不会被打断。',
  },
};

const THEME_OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

function WaveLayer({ space }: { space: DesktopSpace }) {
  if (space === 'awareness') {
    return (
      <div className="wave-layer" data-wave-layer="awareness" aria-hidden="true">
        <span className="wave-ring" style={{ left: '-140px', top: '-160px', width: '600px', height: '600px' }} />
        <span className="wave-ring is-outer" style={{ left: '-270px', top: '-290px', width: '860px', height: '860px' }} />
      </div>
    );
  }

  if (space === 'reflection') {
    return (
      <div className="wave-layer" data-wave-layer="reflection" aria-hidden="true">
        <svg className="wave-svg" viewBox="0 0 1000 600" preserveAspectRatio="none">
          <path className="wave-a" d="M120 -20 C 300 160, 330 380, 215 620" />
          <path className="wave-b" d="M700 -20 C 560 180, 420 380, 265 620" />
        </svg>
      </div>
    );
  }

  if (space === 'exploration') {
    return (
      <div className="wave-layer" data-wave-layer="exploration" aria-hidden="true">
        <svg className="wave-svg" viewBox="0 0 1000 600" preserveAspectRatio="none">
          <path className="wave-a" d="M-40 150 C 240 90, 620 230, 1040 140" />
          <path className="wave-b" d="M-40 470 C 300 545, 660 400, 1040 480" />
        </svg>
      </div>
    );
  }

  return null;
}

interface DiscoveryView {
  readonly kind: 'relation' | 'hypothesis';
  readonly subject: {
    readonly id: string;
    readonly comparisonAxis?: { readonly question: string };
    readonly evidenceSummary?: string;
  };
}

export function App() {
  const { preference, setPreference } = useThemePreference();
  const [activeSpace, setActiveSpace] = useState<DesktopSpace>('records');
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [secret, setSecret] = useState<SecretStatus | null>(null);
  const [appDataPath, setAppDataPath] = useState('');
  const [records, setRecords] = useState<readonly RecordView[]>([]);
  const [discoveries, setDiscoveries] = useState<readonly DiscoveryView[]>([]);
  const [suggestions, setSuggestions] = useState<readonly RelationSuggestion[]>([]);
  const [lastCapturedRecordId, setLastCapturedRecordId] = useState<string | null>(null);
  const [observationMeanings, setObservationMeanings] = useState<
    Readonly<Record<string, ObservationMeaning | undefined>>
  >({});
  const [observationReflections, setObservationReflections] = useState<
    Readonly<Record<string, string | undefined>>
  >({});
  const [pendingObservationKey, setPendingObservationKey] = useState<string | null>(null);
  const [captureText, setCaptureText] = useState('');
  const [search, setSearch] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [exportText, setExportText] = useState('');
  const [notice, setNotice] = useState('正在连接本地运行时……');

  const refresh = useCallback(async () => {
    const [nextStatus, nextRecords, nextDiscoveries, nextSecret, nextPath] =
      await Promise.all([
        runtimeRequest<RuntimeStatus>('/status'),
        runtimeRequest<readonly RecordView[]>(`/records?query=${encodeURIComponent(search)}`),
        runtimeRequest<readonly DiscoveryView[]>('/discoveries'),
        getSecretStatus(),
        getAppDataPath(),
      ]);
    setStatus(nextStatus);
    setRecords(nextRecords);
    setDiscoveries(nextDiscoveries);
    setSecret(nextSecret);
    setAppDataPath(nextPath);
    setBaseUrl((current) => current || nextStatus.ai.baseUrl);
    setModel((current) => current || nextStatus.ai.model);
    setNotice('本地运行时已连接。');
  }, [search]);

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : '桌面运行时不可用。');
    });
  }, [refresh]);

  const capture = async (event: FormEvent) => {
    event.preventDefault();
    if (captureText.trim().length === 0) return;
    const result = await runtimeRequest<{
      readonly ok: boolean;
      readonly value?: { readonly recordId?: string };
      readonly error?: { readonly kind: string };
    }>(
      '/capture',
      { method: 'POST', body: { verbatim: captureText } },
    );
    if (!result.ok) throw new Error(result.error?.kind ?? '保存记录失败。');
    if (result.value?.recordId) setLastCapturedRecordId(result.value.recordId);
    setCaptureText('');
    setNotice('记录已保存到本地数据库。');
    await refresh();
  };

  const configureAI = async (event: FormEvent) => {
    event.preventDefault();
    if (apiKey.trim().length > 0) await storeAPIKey(apiKey);
    const ai = await runtimeRequest<AIStatus>('/ai/configure', {
      method: 'POST',
      body: {
        providerId: 'openai-compatible',
        baseUrl,
        model,
        ...(apiKey.trim().length === 0 ? {} : { apiKey }),
      },
    });
    setApiKey('');
    setStatus((current) => (current === null ? current : { ...current, ai }));
    setSecret(await getSecretStatus());
    setNotice(ai.message);
  };

  const discoverModels = async (refreshModels: boolean) => {
    const ai = await runtimeRequest<AIStatus>('/ai/models', {
      method: 'POST',
      body: { refresh: refreshModels },
    });
    setStatus((current) => (current === null ? current : { ...current, ai }));
    setNotice(ai.message);
  };

  const testConnection = async () => {
    const ai = await runtimeRequest<AIStatus>('/ai/test', { method: 'POST' });
    setStatus((current) => (current === null ? current : { ...current, ai }));
    setNotice(ai.message);
  };

  const selectModel = async (nextModel: string) => {
    setModel(nextModel);
    const ai = await runtimeRequest<AIStatus>('/ai/select-model', {
      method: 'POST',
      body: { model: nextModel },
    });
    setStatus((current) => (current === null ? current : { ...current, ai }));
  };

  const suggest = async () => {
    const selected = [
      ...(lastCapturedRecordId ? [lastCapturedRecordId] : []),
      ...records.map((record) => record.id),
    ].filter((id, index, all) => all.indexOf(id) === index).slice(0, 5);
    if (selected.length < 2) {
      setNotice('至少需要两条记录。');
      return;
    }
    const next = await runtimeRequest<readonly RelationSuggestion[]>('/relations/suggest', {
      method: 'POST',
      body: { recordIds: selected },
    });
    setSuggestions(next);
    setNotice(
      next.length === 0
        ? '记录已保存。暂时没有发现明显联系。这并不代表没有模式，只是当前记录不足以支持进一步观察。'
        : 'AI 观察已返回，尚未成为长期联系。',
    );
  };

  const suggestionKey = (suggestion: RelationSuggestion): string =>
    `${suggestion.relationType}:${suggestion.recordRefs.join(':')}`;

  const submitObservation = async (
    event: FormEvent,
    suggestion: RelationSuggestion,
  ) => {
    event.preventDefault();
    const key = suggestionKey(suggestion);
    const meaning = observationMeanings[key];
    if (meaning === undefined) {
      setNotice('请先选择这次观察与你经历的关系。');
      return;
    }
    const reflectionText = observationReflections[key] ?? '';
    if (meaning !== 'not_my_experience' && reflectionText.trim().length === 0) {
      setNotice('请先写下你的理解；快捷选择本身不会形成长期联系。');
      return;
    }
    setPendingObservationKey(key);
    const result = await runtimeRequest<{
      readonly status:
        | 'discovery'
        | 'discarded'
        | 'reflection_required'
        | 'not_admitted'
        | 'unavailable';
      readonly message: string;
      readonly targetRef?: string;
    }>('/relations/reflect', {
      method: 'POST',
      body: {
        suggestion,
        meaning,
        ...(reflectionText.length === 0 ? {} : { reflectionText }),
      },
    });
    setPendingObservationKey(null);
    setNotice(result.message);
    if (result.status === 'discovery' || result.status === 'discarded') {
      setSuggestions((current) => current.filter((item) => suggestionKey(item) !== key));
      setObservationMeanings((current) => ({ ...current, [key]: undefined }));
      setObservationReflections((current) => ({ ...current, [key]: undefined }));
      await refresh();
    }
  };

  const exportData = async () => {
    const result = await runtimeRequest<{ readonly serialized: string }>('/export');
    setExportText(result.serialized);
    setNotice('已生成本地逻辑导出；当前内容是明文，请自行安全保存。');
  };

  const restoreData = async () => {
    await runtimeRequest('/restore', {
      method: 'POST',
      body: { serialized: exportText },
    });
    setNotice('恢复完成。');
    await refresh();
  };

  const clearSecret = async () => {
    await deleteAPIKey();
    setSecret(await getSecretStatus());
    setNotice('系统凭据中的 API Key 已删除；当前运行进程需重启后完全清除内存副本。');
  };

  const spaceCopy = DESKTOP_SPACE_COPY[activeSpace];

  return (
    <div className="desktop-app-shell">
      <aside className="desktop-sidebar" aria-label="主要导航">
        <div className="desktop-brand" aria-label="见渊">
          <span className="desktop-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <line className="bm-axis" x1="16" y1="1.5" x2="16" y2="30.5" />
              <circle className="bm-ring-outer" cx="16" cy="16" r="9.2" />
              <circle className="bm-ring-inner" cx="16" cy="16" r="4.6" />
              <circle className="bm-core" cx="16" cy="16" r="2.1" />
            </svg>
          </span>
          <span className="desktop-brand-name">见渊</span>
        </div>
        <nav className="desktop-nav-primary" aria-label="产品空间">
          {DESKTOP_SPACES.slice(0, 4).map((space) => (
            <button
              key={space.id}
              type="button"
              className="desktop-nav-link"
              data-active={activeSpace === space.id ? 'true' : 'false'}
              aria-pressed={activeSpace === space.id}
              onClick={() => setActiveSpace(space.id)}
            >
              <strong>{space.label}</strong>
              <span>{space.description}</span>
            </button>
          ))}
        </nav>
        <nav className="desktop-nav-secondary" aria-label="次级导航">
          <button
            type="button"
            className="desktop-nav-link"
            data-active={activeSpace === 'settings' ? 'true' : 'false'}
            aria-pressed={activeSpace === 'settings'}
            onClick={() => setActiveSpace('settings')}
          >
            <strong>设置</strong>
            <span>服务、数据与隐私</span>
          </button>
        </nav>
        <div className="desktop-sidebar-status">
          <span className="k">AI 服务</span>
          <span className="v"><i className="status-dot" />{aiStatusLabel(status?.ai.status)}</span>
        </div>
      </aside>

      <nav className="desktop-mobile-nav" aria-label="主要导航">
        {DESKTOP_SPACES.slice(0, 4).map((space) => (
          <button
            key={space.id}
            type="button"
            className="desktop-mobile-nav-link"
            data-active={activeSpace === space.id ? 'true' : 'false'}
            aria-pressed={activeSpace === space.id}
            onClick={() => setActiveSpace(space.id)}
          >
            {space.label}
          </button>
        ))}
        <button
          type="button"
          className="desktop-mobile-nav-link"
          data-active={activeSpace === 'settings' ? 'true' : 'false'}
          aria-pressed={activeSpace === 'settings'}
          onClick={() => setActiveSpace('settings')}
        >
          更多
        </button>
      </nav>

      <main data-active-space={activeSpace}>
        <WaveLayer space={activeSpace} />
        <header className="desktop-page-header">
          <p className="eyebrow">见渊 · {DESKTOP_SPACES.find((space) => space.id === activeSpace)?.label}</p>
          <h1>{spaceCopy.title}</h1>
          <p>{spaceCopy.description}</p>
        </header>

        <div className="status-bar" role="status">{notice}</div>

      <section data-space="settings">
        <h2>外观</h2>
        <div className="settings-row">
          <span className="k">主题</span>
          <span className="seg" role="group" aria-label="外观偏好">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={preference === option.value ? 'true' : 'false'}
                aria-pressed={preference === option.value}
                onClick={() => setPreference(option.value)}
              >
                {option.label}
              </button>
            ))}
          </span>
        </div>
      </section>

      <section data-space="settings">
        <h2>本地运行状态</h2>
        <dl>
          <div><dt>AppData</dt><dd>{appDataPath || '读取中'}</dd></div>
          <div><dt>SQLite</dt><dd>{status?.databasePath ?? '读取中'}</dd></div>
          <div><dt>数据库加密</dt><dd>{status?.encryption.deviceLevelVerified ? '已验证' : '未完成（AppData 不等于加密）'}</dd></div>
        </dl>
      </section>

      <section data-space="records">
        <h2>记录</h2>
        <form onSubmit={(event) => void capture(event).catch((error: Error) => setNotice(error.message))}>
          <label htmlFor="desktop-record-input">你想为以后留下什么？</label>
          <textarea id="desktop-record-input" value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder="写下此刻值得保留的话。" />
          <button type="submit">保存记录</button>
        </form>
      </section>

      <section data-space="records">
        <h2>历史与搜索</h2>
        <div className="row">
          <label htmlFor="desktop-record-search">搜索原话</label>
          <input id="desktop-record-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索原话" />
          <button type="button" onClick={() => void refresh()}>搜索</button>
        </div>
        {records.length === 0 ? <p className="muted">还没有记录。</p> : (
          <ol className="timeline">
            {records.map((record) => (
              <li key={record.id}>
                <div className="rec-rail"><span className="rec-dot" /></div>
                <div>{record.verbatim ?? '（无可显示原话）'}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section data-space="settings">
        <h2>AI 服务</h2>
        <p className={`pill ${status?.ai.status ?? 'unconfigured'}`}>{aiStatusLabel(status?.ai.status)}</p>
        <p className="muted">连接状态：{connectionStatusLabel(status?.ai.connectionStatus)}</p>
        <p>{status?.ai.message}</p>
        <p className="muted">凭据存储：{secret?.backend ?? '读取中'}；API Key：{secret?.configured ? '已存入系统凭据' : '未配置'}</p>
        <form onSubmit={(event) => void configureAI(event).catch((error: Error) => setNotice(error.message))}>
          <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
          <label>API Key<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={secret?.configured ? '留空保持现有凭据' : '只写入系统凭据'} /></label>
          <label>模型标识<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="可手动填写" /></label>
          <div className="row">
            <button type="submit">保存配置</button>
            <button type="button" onClick={() => void discoverModels(true).catch((error: Error) => setNotice(error.message))}>获取模型列表</button>
            <button type="button" onClick={() => void testConnection().catch((error: Error) => setNotice(error.message))}>测试连接</button>
            <button type="button" className="quiet" onClick={() => void clearSecret().catch((error: Error) => setNotice(error.message))}>删除 API Key</button>
          </div>
        </form>
        {(status?.ai.models.length ?? 0) > 0 ? (
          <select value={model} onChange={(event) => void selectModel(event.target.value)}>
            <option value="">选择模型</option>
            {status?.ai.models.map((item) => <option key={item.id} value={item.id}>{item.displayName ?? item.id}</option>)}
          </select>
        ) : null}
      </section>

      <section data-space="awareness">
        <h2>观察与回看</h2>
        <button type="button" onClick={() => void suggest().catch((error: Error) => setNotice(error.message))}>看看有没有值得回看的线索</button>
        {suggestions.map((suggestion) => {
          const key = suggestionKey(suggestion);
          const meaning = observationMeanings[key];
          const pending = pendingObservationKey === key;
          return (
            <article key={key} className="ai-observation-card">
              <h3>AI 观察到的一种可能联系</h3>
              <p className="muted">这只是一次临时观察；是否对你有意义，由你的理解决定。</p>
              <div className="ai-observation-copy">
                <h4>相关记录</h4>
                <p className="muted">这些记录只是 AI 观察时参考的信息，不代表已经形成事实关系。</p>
                {suggestion.recordRefs.map((recordId) => {
                  const record = records.find((item) => item.id === recordId);
                  return <blockquote key={recordId}>{record?.verbatim ?? '（这条记录当前不可读取）'}</blockquote>;
                })}
              </div>
              <div className="ai-observation-copy">
                <h4>AI 注意到</h4>
                <p>{suggestion.evidenceSummary}</p>
              </div>
              <div className="ai-observation-copy">
                <h4>一种可能解释</h4>
                <p>一种可能是，这些记录在“{suggestion.comparisonAxis.dimension}”上呈现了相似的安排。</p>
                <p className="muted">但也可能存在其他解释。</p>
              </div>
              <div className="ai-observation-copy">
                <h4>AI 也不确定</h4>
                <p>我无法判断这是长期模式，还是这几次经历恰好相似。</p>
              </div>
              <div className="ai-observation-copy">
                <h4>一个可以继续思考的问题</h4>
                <blockquote>{suggestion.comparisonAxis.question}</blockquote>
              </div>
              <form onSubmit={(event) => void submitObservation(event, suggestion).catch((error: Error) => { setPendingObservationKey(null); setNotice(error.message); })}>
                <fieldset className="user-reflection-input" disabled={pending}>
                  <legend>你的理解</legend>
                  <p>这个观察与你的体验接近吗？这不是对 AI 的批准。</p>
                  <label><input type="radio" name={`meaning-${key}`} value="connected" checked={meaning === 'connected'} onChange={() => setObservationMeanings((current) => ({ ...current, [key]: 'connected' }))} required />这和我的经历有联系</label>
                  <label><input type="radio" name={`meaning-${key}`} value="different_understanding" checked={meaning === 'different_understanding'} onChange={() => setObservationMeanings((current) => ({ ...current, [key]: 'different_understanding' }))} />有一点关联，但我的理解不同</label>
                  <label><input type="radio" name={`meaning-${key}`} value="not_my_experience" checked={meaning === 'not_my_experience'} onChange={() => setObservationMeanings((current) => ({ ...current, [key]: 'not_my_experience' }))} />这不是我的体验</label>
                  <label>写下你自己的理解<textarea value={observationReflections[key] ?? ''} onChange={(event) => setObservationReflections((current) => ({ ...current, [key]: event.target.value }))} placeholder="只有你的话会成为我的理解。" /></label>
                  <p className="muted">快捷选择只表示你是否愿意继续理解；没有文字不会进入长期联系。</p>
                  <button type="submit">{pending ? '正在保存你的理解……' : '提交我的理解'}</button>
                </fieldset>
              </form>
            </article>
          );
        })}
      </section>

      <section data-space="reflection">
        <h2>你的理解</h2>
        <p className="muted">还没有可以集中展示的理解。先在觉察中写下自己的话；快捷选择本身不会成为长期数据。</p>
        <button type="button" onClick={() => setActiveSpace('awareness')}>去觉察中回看</button>
      </section>

      <section data-space="exploration">
        <h2>长期联系</h2>
        {discoveries.filter((item) => item.kind === 'relation').length === 0 ? (
          <p className="muted">还没有可回看的长期联系。当你写下自己的理解并形成联系后，它会出现在这里。</p>
        ) : (
          <ol className="exploration-list">
            {discoveries.filter((item) => item.kind === 'relation').map((item) => (
              <li key={item.subject.id}>
                <div className="conn-rail">
                  <svg className="rail-curve" viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M12 -10 C 14 30, 10 70, 12 110" />
                  </svg>
                  <span className="orbit"><i /></span>
                </div>
                <div>
                  <h3 className="conn-title">{item.subject.comparisonAxis?.question ?? item.subject.id}</h3>
                  {item.subject.evidenceSummary ? <p className="conn-ev">{item.subject.evidenceSummary}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section data-space="settings">
        <h2>导出与恢复</h2>
        <p className="muted">Spike 的逻辑导出是明文，不代表加密备份。</p>
          <label htmlFor="desktop-export-data">备份内容</label>
          <textarea id="desktop-export-data" value={exportText} onChange={(event) => setExportText(event.target.value)} placeholder="导出内容会显示在这里，也可粘贴已有备份后恢复。" />
        <div className="row">
          <button type="button" onClick={() => void exportData().catch((error: Error) => setNotice(error.message))}>导出</button>
          <button type="button" onClick={() => void restoreData().catch((error: Error) => setNotice(error.message))}>恢复</button>
        </div>
      </section>
      </main>
    </div>
  );
}

