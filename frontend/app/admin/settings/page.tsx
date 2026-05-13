'use client';

import { useState, useEffect, useRef } from 'react';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface Settings {
  [key: string]: string;
}

const sections = [
  { id: 'site', label: '网站信息', icon: '🌐' },
  { id: 'storage', label: '存储设置', icon: '☁️' },
  { id: 'sms', label: '短信平台', icon: '📱' },
  { id: 'wechat', label: '微信登录', icon: '💬' },
  { id: 'feishu', label: '飞书集成', icon: '🏢' },
  { id: 'notify', label: '工单通知', icon: '🔔' },
  { id: 'ai', label: 'AI 客服', icon: '🤖' },
  { id: 'media', label: '素材生成', icon: '🎨' },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [activeSection, setActiveSection] = useState('site');
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi.getSettings().then(res => {
      setSettings(res.settings || {});
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const update = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const token = localStorage.getItem('imai-admin-token');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload/file', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      update('site_logo', data.url);
      showToast('Logo 上传成功', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.saveSettings(settings);
      showToast('设置已保存', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-4 p-6">{[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-[#f1f5f9]" />)}</div>;
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-4rem)]">
      {/* 左侧导航 */}
      <nav className="w-48 flex-shrink-0">
        <div className="sticky top-20 space-y-1">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                activeSection === s.id
                  ? 'bg-[#8b5cf6]/10 text-[#8b5cf6]'
                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b]'
              }`}
            >
              <span className="text-base">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 右侧内容 */}
      <div className="flex-1 max-w-2xl space-y-6 pb-8">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#1e293b]">
            {sections.find(s => s.id === activeSection)?.icon} {sections.find(s => s.id === activeSection)?.label}
          </h1>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? (
              <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white mr-1.5" />保存中...</>
            ) : '保存设置'}
          </button>
        </div>

        {/* === 网站信息 === */}
        {activeSection === 'site' && (
          <div className="card">
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">网站名称</label>
                <input value={settings.site_name || ''} onChange={e => update('site_name', e.target.value)} className="input" placeholder="imai.work" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1e293b]">Logo</label>
                <div className="flex items-center gap-5">
                  <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-[#e2e8f0] bg-[#f8fafc] overflow-hidden transition-colors hover:border-[#8b5cf6]">
                    {settings.site_logo ? (
                      <img src={settings.site_logo} alt="Logo" className="h-full w-full object-contain p-1" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="text-center">
                        <svg className="mx-auto h-6 w-6 text-[#cbd5e1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span className="mt-1 block text-[10px] text-[#94a3b8]">无Logo</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="btn btn-secondary btn-sm">
                      {uploadingLogo ? '上传中...' : settings.site_logo ? '更换Logo' : '上传Logo'}
                    </button>
                    <p className="text-xs text-[#94a3b8]">PNG / SVG / JPG，建议 200×200</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">ICP 备案号</label>
                <input value={settings.icp_number || ''} onChange={e => update('icp_number', e.target.value)} placeholder="沪ICP备2024xxxxxx号" className="input" />
              </div>
            </div>
          </div>
        )}

        {/* === 存储设置 === */}
        {activeSection === 'storage' && (
          <div className="card">
            <div className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-[#0ea5e9]/10 to-[#06b6d4]/10 p-4 mb-5">
              <span className="text-2xl">☁️</span>
              <div>
                <p className="text-sm font-semibold text-[#1e293b]">文件存储</p>
                <p className="text-xs text-[#64748b]">配置图片、文件的存储方式。默认使用本地存储，可切换为 OSS 云存储</p>
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">存储方式</label>
                <select value={settings.storage_type || 'local'} onChange={e => update('storage_type', e.target.value)} className="select">
                  <option value="local">本地存储</option>
                  <option value="oss">阿里云 OSS</option>
                  <option value="qiniu">七牛云</option>
                  <option value="cos">腾讯云 COS</option>
                </select>
                <p className="mt-1.5 text-xs text-[#94a3b8]">切换后新上传的文件将存储到对应位置，已上传的文件不受影响</p>
              </div>

              {settings.storage_type && settings.storage_type !== 'local' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">Bucket / 空间名</label>
                      <input value={settings.oss_bucket || ''} onChange={e => update('oss_bucket', e.target.value)} placeholder="my-bucket" className="input" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">区域 / Region</label>
                      <input value={settings.oss_region || ''} onChange={e => update('oss_region', e.target.value)} placeholder="oss-cn-shenzhen" className="input" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">访问域名（Endpoint）</label>
                    <input value={settings.oss_endpoint || ''} onChange={e => update('oss_endpoint', e.target.value)} placeholder="https://oss-cn-shenzhen.aliyuncs.com" className="input" />
                    <p className="mt-1 text-xs text-[#94a3b8]">OSS 的外网访问域名</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AccessKey ID</label>
                      <input value={settings.oss_access_key || ''} onChange={e => update('oss_access_key', e.target.value)} className="input" type="password" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AccessKey Secret</label>
                      <input value={settings.oss_secret_key || ''} onChange={e => update('oss_secret_key', e.target.value)} className="input" type="password" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">自定义域名（可选）</label>
                    <input value={settings.oss_cdn_domain || ''} onChange={e => update('oss_cdn_domain', e.target.value)} placeholder="https://cdn.yourdomain.com" className="input" />
                    <p className="mt-1 text-xs text-[#94a3b8]">如果配置了 CDN 加速域名，上传后的文件 URL 将使用此域名</p>
                  </div>
                </>
              )}

              {settings.storage_type === 'local' && (
                <div className="rounded-lg bg-[#f8fafc] border border-[#e2e8f0] p-4">
                  <p className="text-sm text-[#64748b]">
                    📁 当前使用本地存储，文件保存在服务器 <code className="bg-[#f1f5f9] px-1.5 py-0.5 rounded text-xs">uploads/</code> 目录下。
                  </p>
                  <p className="mt-2 text-xs text-[#94a3b8]">适合开发测试环境。生产环境建议切换为 OSS 云存储，避免服务器迁移时文件丢失。</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === 短信平台 === */}
        {activeSection === 'sms' && (
          <div className="card">
            <p className="mb-5 text-sm text-[#64748b]">用于发送验证码（手机号注册/登录）</p>
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">服务商</label>
                <select value={settings.sms_provider || ''} onChange={e => update('sms_provider', e.target.value)} className="select">
                  <option value="">请选择</option>
                  <option value="aliyun">阿里云短信</option>
                  <option value="tencent">腾讯云短信</option>
                  <option value="qiniu">七牛云短信</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AccessKey</label>
                  <input value={settings.sms_access_key || ''} onChange={e => update('sms_access_key', e.target.value)} className="input" type="password" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">SecretKey</label>
                  <input value={settings.sms_secret || ''} onChange={e => update('sms_secret', e.target.value)} className="input" type="password" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">短信签名</label>
                <input value={settings.sms_sign || ''} onChange={e => update('sms_sign', e.target.value)} placeholder="例如：imai.work" className="input" />
              </div>
            </div>
          </div>
        )}

        {/* === 微信登录 === */}
        {activeSection === 'wechat' && (
          <div className="card">
            <p className="mb-5 text-sm text-[#64748b]">需要微信开放平台资质（企业认证），没有可先留空</p>
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AppID</label>
                <input value={settings.wechat_app_id || ''} onChange={e => update('wechat_app_id', e.target.value)} className="input" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AppSecret</label>
                <input value={settings.wechat_app_secret || ''} onChange={e => update('wechat_app_secret', e.target.value)} className="input" type="password" />
              </div>
            </div>
          </div>
        )}

        {/* === 飞书集成 === */}
        {activeSection === 'feishu' && (
          <div className="card">
            <p className="mb-5 text-sm text-[#64748b]">用于工单系统写入飞书多维表格</p>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AppID</label>
                  <input value={settings.feishu_app_id || ''} onChange={e => update('feishu_app_id', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AppSecret</label>
                  <input value={settings.feishu_app_secret || ''} onChange={e => update('feishu_app_secret', e.target.value)} className="input" type="password" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">多维表格 AppToken</label>
                  <input value={settings.bitable_app_token || ''} onChange={e => update('bitable_app_token', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">工作表 TableID</label>
                  <input value={settings.bitable_table_id || ''} onChange={e => update('bitable_table_id', e.target.value)} className="input" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === 工单通知 === */}
        {activeSection === 'notify' && (
          <div className="card">
            <p className="mb-5 text-sm text-[#64748b]">新工单提交时，自动推送消息到飞书群或企业微信群</p>
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">通知渠道</label>
                <select value={settings.ticket_notify_channel || ''} onChange={e => update('ticket_notify_channel', e.target.value)} className="select">
                  <option value="">关闭通知</option>
                  <option value="feishu">飞书机器人</option>
                  <option value="wecom">企业微信机器人</option>
                </select>
              </div>
              {(settings.ticket_notify_channel === 'feishu' || settings.ticket_notify_channel === 'wecom') && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">Webhook 地址</label>
                  <input
                    value={settings.ticket_notify_webhook || ''}
                    onChange={e => update('ticket_notify_webhook', e.target.value)}
                    placeholder={settings.ticket_notify_channel === 'feishu'
                      ? 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx'
                      : 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx'
                    }
                    className="input"
                  />
                  <p className="mt-2 rounded-lg bg-[#f8fafc] p-3 text-xs text-[#64748b] leading-relaxed">
                    {settings.ticket_notify_channel === 'feishu'
                      ? '📌 操作路径：飞书群设置 → 群机器人 → 添加机器人 → 自定义机器人 → 复制 Webhook 地址'
                      : '📌 操作路径：企业微信群 → 右上角… → 群机器人 → 添加机器人 → 复制 Webhook 地址'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === AI 客服（预留） === */}
        {activeSection === 'ai' && (
          <div className="card">
            <div className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-[#8b5cf6]/10 to-[#a855f7]/10 p-4 mb-5">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="text-sm font-semibold text-[#1e293b]">AI 智能客服</p>
                <p className="text-xs text-[#64748b]">用户提问先由 AI 回答，解决不了再转人工工单</p>
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AI 服务商</label>
                <select value={settings.ai_provider || ''} onChange={e => update('ai_provider', e.target.value)} className="select">
                  <option value="">未启用</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                  <option value="qwen">通义千问</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">API Key</label>
                  <input value={settings.ai_api_key || ''} onChange={e => update('ai_api_key', e.target.value)} className="input" type="password" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">模型</label>
                  <input value={settings.ai_model || ''} onChange={e => update('ai_model', e.target.value)} placeholder="deepseek-chat" className="input" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">AI 人设（System Prompt）</label>
                <textarea
                  value={settings.ai_system_prompt || ''}
                  onChange={e => update('ai_system_prompt', e.target.value)}
                  placeholder="你是 imai.work 的智能客服助手，专门解答关于养号、获客、短视频运营的问题..."
                  className="input"
                  rows={5}
                />
                <p className="mt-1.5 text-xs text-[#94a3b8]">定义 AI 的角色、专业领域和回答风格</p>
              </div>
              <div className="border-t border-[#e2e8f0] pt-5">
                <p className="mb-4 text-sm font-semibold text-[#1e293b]">📐 向量检索（Embedding）</p>
                <p className="mb-4 text-xs text-[#64748b]">用于知识库语义检索。配置后 AI 客服能更准确地理解用户问题，匹配相关知识。</p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">Embedding 服务商</label>
                    <select
                      value={settings.embedding_provider || ''}
                      onChange={e => {
                        const provider = e.target.value;
                        update('embedding_provider', provider);
                        // 自动填充默认配置
                        const defaults: Record<string, {url: string, model: string}> = {
                          qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', model: 'text-embedding-v3' },
                          openai: { url: 'https://api.openai.com/v1/embeddings', model: 'text-embedding-3-small' },
                        };
                        if (defaults[provider]) {
                          update('embedding_base_url', defaults[provider].url);
                          update('embedding_model', defaults[provider].model);
                        } else {
                          update('embedding_base_url', '');
                          update('embedding_model', '');
                        }
                      }}
                      className="select"
                    >
                      <option value="">未启用（仅使用关键词匹配）</option>
                      <option value="local">本地模型（开发环境）</option>
                      <option value="qwen">阿里云 DashScope</option>
                      <option value="openai">OpenAI</option>
                    </select>
                    <p className="mt-1.5 text-xs text-[#94a3b8]">
                      {settings.embedding_provider === 'local'
                        ? '⚠️ 本地模型仅适用于开发环境，需要额外启动 Python Embedding 服务'
                        : settings.embedding_provider === 'qwen'
                        ? '推荐 text-embedding-v3，有免费额度，中文效果好'
                        : settings.embedding_provider === 'openai'
                        ? 'text-embedding-3-small，按量付费'
                        : '选择一个 Embedding 服务商用于知识库向量化'
                      }
                    </p>
                  </div>
                  {settings.embedding_provider && settings.embedding_provider !== 'local' && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">API Key</label>
                        <input value={settings.embedding_api_key || ''} onChange={e => update('embedding_api_key', e.target.value)} className="input" type="password" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">模型</label>
                        <select value={settings.embedding_model || ''} onChange={e => update('embedding_model', e.target.value)} className="select">
                          {settings.embedding_provider === 'qwen' && (
                            <>
                              <option value="text-embedding-v3">text-embedding-v3（推荐，有免费额度）</option>
                              <option value="text-embedding-v4">text-embedding-v4（效果更好，付费）</option>
                            </>
                          )}
                          {settings.embedding_provider === 'openai' && (
                            <>
                              <option value="text-embedding-3-small">text-embedding-3-small（推荐）</option>
                              <option value="text-embedding-3-large">text-embedding-3-large（效果更好）</option>
                              <option value="text-embedding-ada-002">text-embedding-ada-002（旧版）</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">API 地址</label>
                        <input
                          value={settings.embedding_base_url || ''}
                          onChange={e => update('embedding_base_url', e.target.value)}
                          className="input"
                        />
                        <p className="mt-1 text-xs text-[#94a3b8]">已自动填入默认地址，通常无需修改</p>
                      </div>
                    </>
                  )}
                  {settings.embedding_provider === 'local' && (
                    <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] p-4">
                      <p className="text-sm text-[#92400e]">
                        ⚠️ 本地模式需要额外启动 Embedding 服务：
                      </p>
                      <code className="mt-2 block rounded bg-[#fef3c7] px-3 py-2 text-xs text-[#78350f]">
                        cd ~/imai-website && source .venv/bin/activate && python3 embedding_server.py
                      </code>
                      <p className="mt-2 text-xs text-[#92400e]">服务器部署请切换为云 API 服务商</p>
                    </div>
                  )}
                  <div>
                    <button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem('imai-admin-token');
                          const res = await fetch('/api/admin/ai/rebuild-index', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          showToast('索引重建成功: ' + (data.count || '') + ' 条', 'success');
                        } catch (err: any) {
                          showToast('重建失败: ' + err.message, 'error');
                        }
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      🔄 重建向量索引
                    </button>
                    <p className="mt-1.5 text-xs text-[#94a3b8]">更换 Embedding 服务商后，需要重建索引以使用新的向量模型</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">知识库</label>
                <div className="rounded-lg border-2 border-dashed border-[#e2e8f0] p-6 text-center">
                  <svg className="mx-auto h-10 w-10 text-[#cbd5e1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
                  <p className="mt-2 text-sm font-medium text-[#1e293b]">知识库管理</p>
                  <p className="mt-1 text-xs text-[#94a3b8]">上传文档、FAQ、教程内容，AI 将基于这些知识回答用户问题</p>
                  <a href="/admin/ai" className="btn btn-primary btn-sm mt-3 inline-block">前往管理知识库 →</a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === 素材生成 === */}
        {activeSection === 'media' && (
          <div className="card">
            <div className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-[#f59e0b]/10 to-[#ef4444]/10 p-4 mb-5">
              <span className="text-2xl">🎨</span>
              <div>
                <p className="text-sm font-semibold text-[#1e293b]">AI 素材生成</p>
                <p className="text-xs text-[#64748b]">AI 客服可以生成图片/视频素材回答用户</p>
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">图片生成</label>
                <select value={settings.image_gen_provider || ''} onChange={e => update('image_gen_provider', e.target.value)} className="select">
                  <option value="">未启用</option>
                  <option value="dalle">DALL·E (OpenAI)</option>
                  <option value="tongyi">通义万相</option>
                  <option value="flux">Flux</option>
                </select>
              </div>
              {(settings.image_gen_provider) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">API Key</label>
                    <input value={settings.image_gen_api_key || ''} onChange={e => update('image_gen_api_key', e.target.value)} className="input" type="password" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">API 地址（可选）</label>
                    <input value={settings.image_gen_base_url || ''} onChange={e => update('image_gen_base_url', e.target.value)} placeholder="https://api.example.com/v1" className="input" />
                  </div>
                </div>
              )}
              <div className="border-t border-[#e2e8f0] pt-5">
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">视频生成</label>
                <select value={settings.video_gen_provider || ''} onChange={e => update('video_gen_provider', e.target.value)} className="select">
                  <option value="">未启用</option>
                  <option value="kling">可灵</option>
                  <option value="runway">Runway</option>
                  <option value="pika">Pika</option>
                </select>
              </div>
              {(settings.video_gen_provider) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">API Key</label>
                    <input value={settings.video_gen_api_key || ''} onChange={e => update('video_gen_api_key', e.target.value)} className="input" type="password" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">API 地址（可选）</label>
                    <input value={settings.video_gen_base_url || ''} onChange={e => update('video_gen_base_url', e.target.value)} placeholder="https://api.example.com/v1" className="input" />
                  </div>
                </div>
              )}
              <p className="rounded-lg bg-[#f8fafc] p-3 text-xs text-[#64748b] leading-relaxed">
                📌 配置后，AI 客服在回答时可以自动生成图片/视频素材。未配置则仅提供文字回答。
              </p>
            </div>
          </div>
        )}

        {/* 底部导航 */}
        <div className="flex items-center justify-between pt-4 border-t border-[#e2e8f0]">
          <div className="flex gap-2">
            {sections.map((s, i) => {
              if (s.id === activeSection && i > 0) {
                return (
                  <button key="prev" onClick={() => setActiveSection(sections[i-1].id)}
                    className="btn btn-secondary btn-sm">
                    ← {sections[i-1].label}
                  </button>
                );
              }
              return null;
            })}
            {sections.map((s, i) => {
              if (s.id === activeSection && i < sections.length - 1) {
                return (
                  <button key="next" onClick={() => setActiveSection(sections[i+1].id)}
                    className="btn btn-secondary btn-sm">
                    {sections[i+1].label} →
                  </button>
                );
              }
              return null;
            })}
          </div>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
