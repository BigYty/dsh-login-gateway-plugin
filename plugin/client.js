window.__ModuleLoader__.load({
  id: '@local/dsh-login-gateway',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh.loginGateway';
    const dictionaries = {
      en: {
        nav: 'DSH login', title: 'Login gateway settings', intro: 'Manage this DSH instance’s protected login page and account.',
        currentAccount: 'Signed in as', updateTitle: 'Update credentials', currentPassword: 'Current password',
        username: 'Username', newPassword: 'New password', confirmPassword: 'Confirm new password',
        usernameHint: 'Use 1-64 letters, numbers, dots, underscores, or hyphens.', passwordHint: 'Leave the password fields blank to keep the current password. New passwords must be at least 12 characters.',
        save: 'Save changes', saving: 'Saving…', signOutTitle: 'Session', signOut: 'Sign out', signingOut: 'Signing out…',
        loadError: 'Could not load account details. Sign in again and reopen this page.', currentRequired: 'Enter your current password to continue.',
        passwordMismatch: 'The new passwords do not match.', loadFailed: 'Could not load account details.', updateFailed: 'Could not update credentials. Check the current password and try again.',
        signOutFailed: 'Could not sign out. Please retry.', saved: 'Credentials updated. Sign in with the new details.', signedOut: 'Signed out. Redirecting to login…',
        confirmSignOut: 'Sign out of this browser session?',
        loginPageTitle: 'Login page appearance', backgroundUrl: 'Background image URL', uploadImage: 'Upload image',
        backgroundHint: 'Direct image URLs must use HTTPS. The supported 3650000 API accepts its HTTP or HTTPS URL; its HTML image link is resolved server-side and upgraded to HTTPS. Example: http://3650000.xyz/api/?type=img&mode=3,5,7,8,9.',
        saveAppearance: 'Save appearance', customHtml: 'Custom login-page HTML, CSS, and JavaScript',
        customHtmlHint: 'Your code runs in an isolated sandbox behind the login form. It cannot read or change the username, password, Turnstile area, or cookies. Fetch and network APIs are blocked; HTTPS assets can be loaded. Add the effects you want here; none are preinstalled.',
        turnstileTitle: 'Cloudflare Turnstile keys', turnstileStatus: 'A key pair is configured. Current keys are never displayed.',
        turnstileSiteKey: 'New Site Key', turnstileSecretKey: 'New Secret Key', turnstilePassword: 'Current password',
        rotationBackupInfo: 'The current key pair stays active while this verification is pending.',
        turnstileHint: 'Keys remain blank until replaced. The server tests the pair with Cloudflare before saving; a failed check keeps the previous pair.',
        verifyKeys: 'Verify and save keys', verifyingKeys: 'Preparing verification…', previewLogin: 'Preview login page',
        backgroundSaved: 'Login page appearance saved.', backgroundUploadFailed: 'Could not upload the image.',
        appearanceFailed: 'Could not save appearance settings.', invalidImage: 'Choose a PNG, JPEG, or WebP image up to 4 MiB.',
        keyFieldsRequired: 'Enter both new Turnstile keys and your current password.', keyCheckOpened: 'Verification opened in a new tab. Complete the Cloudflare check there.',
        keyCheckSaved: 'Turnstile keys verified and saved.', keyCheckFailed: 'Key verification failed; the previous keys were retained.', keyCheckMessage: 'Complete the verification in the opened tab to save the new key pair.',
        keyStartFailed: 'Could not start key verification.', customHtmlSaved: 'Custom login-page code saved.',
      },
      zh: {
        nav: 'DSH 登录管理', title: '登录网关设置', intro: '管理此 DSH 实例的受保护登录页与账号。',
        currentAccount: '当前账号', updateTitle: '修改登录凭据', currentPassword: '当前密码',
        username: '用户名', newPassword: '新密码', confirmPassword: '确认新密码',
        usernameHint: '用户名为 1-64 位字母、数字、点、下划线或连字符。', passwordHint: '不修改密码时留空。新密码至少 12 位。',
        save: '保存修改', saving: '正在保存…', signOutTitle: '会话', signOut: '退出登录', signingOut: '正在退出…',
        loadError: '无法读取账号信息。请重新登录后再打开此页面。', currentRequired: '请输入当前密码以继续。',
        passwordMismatch: '两次输入的新密码不一致。', loadFailed: '无法读取账号信息。', updateFailed: '无法修改凭据，请检查当前密码后重试。',
        signOutFailed: '退出失败，请重试。', saved: '凭据已更新，请使用新凭据重新登录。', signedOut: '已退出，正在跳转到登录页…',
        confirmSignOut: '确定退出此浏览器会话吗？',
        loginPageTitle: '登录页外观', backgroundUrl: '背景图片网址', uploadImage: '上传图片',
        backgroundHint: 'HTTPS 图片直链可用；3650000 API 支持输入 HTTP 或 HTTPS，服务端会解析 HTML 中的图片链接并升级为 HTTPS。示例：http://3650000.xyz/api/?type=img&mode=3,5,7,8,9。',
        saveAppearance: '保存外观', customHtml: '自定义登录页 HTML、CSS 与 JavaScript',
        customHtmlHint: '代码会在登录框后方的隔离沙箱中运行，不能读取或修改账号、密码、Turnstile 区域或 Cookie；fetch 等网络接口会被阻止，但可加载 HTTPS 资源。在此编写想要的效果；不预置挂件或特效。',
        turnstileTitle: 'Cloudflare Turnstile 密钥', turnstileStatus: '已配置一组密钥。当前密钥不会展示。',
        turnstileSiteKey: '新的 Site Key', turnstileSecretKey: '新的 Secret Key', turnstilePassword: '当前密码',
        rotationBackupInfo: '验证完成前，当前密钥仍继续生效，并保留为回滚备份。',
        turnstileHint: '替换前密钥框保持空白。服务器会先向 Cloudflare 验证新密钥，成功后才保存；验证失败则保留原密钥。',
        verifyKeys: '验证并保存密钥', verifyingKeys: '正在准备验证…', previewLogin: '预览登录页',
        backgroundSaved: '登录页外观已保存。', backgroundUploadFailed: '图片上传失败。',
        appearanceFailed: '无法保存外观设置。', invalidImage: '请选择不超过 4 MiB 的 PNG、JPEG 或 WebP 图片。',
        keyFieldsRequired: '请输入一对新 Turnstile 密钥和当前密码。', keyCheckOpened: '已在新标签页打开验证，请在那里完成人机验证。',
        keyCheckSaved: 'Turnstile 密钥验证成功并已保存。', keyCheckFailed: '密钥验证失败，已保留原密钥。', keyCheckMessage: '请在新打开的标签页完成人机验证以保存密钥。',
        keyStartFailed: '无法启动密钥验证。',
        customHtmlSaved: '登录页自定义代码已保存。',
      },
    };
    const css = `
      .dsh-access-page { max-width: 760px; color: var(--ui-text); display: flex; flex-direction: column; gap: 18px; }
      .dsh-access-title { margin: 0; font-size: 18px; font-weight: 600; }
      .dsh-access-intro, .dsh-access-hint { margin: 0; color: var(--ui-text-dim); font-size: 13px; line-height: 1.5; }
      .dsh-access-block { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--ui-border); padding-top: 16px; }
      .dsh-access-block h3 { margin: 0; color: var(--ui-text); font-size: 15px; font-weight: 600; }
      .dsh-access-row { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .dsh-access-row > label { font-size: 13px; color: var(--ui-text); }
      .dsh-access-field { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .dsh-access-field input, .dsh-access-field textarea { width: 100%; min-width: 0; padding: 9px 10px; color: var(--ui-text); background: transparent; border: 0; border-radius: 10px; outline: 0; font: inherit; }
      .dsh-access-field input { height: 38px; }
      .dsh-access-field textarea { min-height: 240px; resize: vertical; line-height: 1.45; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; tab-size: 2; }
      .dsh-access-box { position: relative; display: flex; align-items: center; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-bg); transition: border-color .2s ease, box-shadow .2s ease, transform .12s ease; }
      .dsh-access-box:focus-within { border-color: color-mix(in srgb, var(--ui-brand) 60%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-brand) 14%, transparent); }
      .dsh-access-box[data-state='error'] { border-color: var(--ui-danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-danger) 15%, transparent); animation: dsh-field-shake .18s ease-in-out; }
      .dsh-access-box[data-state='success'] { border-color: var(--ui-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-success) 15%, transparent); }
      @keyframes dsh-field-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
      @media (prefers-reduced-motion: reduce) { .dsh-access-box[data-state='error'] { animation: none; } }
      .dsh-access-box > input, .dsh-access-box > textarea { flex: 1; min-width: 0; }
      .dsh-field-mark { flex: 0 0 auto; width: 18px; height: 18px; display: none; align-items: center; justify-content: center; border-radius: 50%; margin-right: 10px; color: var(--ui-bg); font-size: 11px; font-weight: 700; line-height: 1; }
      .dsh-field-mark[data-state='error'] { display: inline-flex; background: var(--ui-danger); }
      .dsh-field-mark[data-state='success'] { display: inline-flex; background: var(--ui-success); }
      .dsh-field-mark svg { display: block; width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
      .dsh-field-message { min-height: 18px; margin: 0; color: var(--ui-text-dim); font-size: 11px; line-height: 1.45; }
      .dsh-field-message[data-state='error'] { color: var(--ui-danger); }
      .dsh-field-message[data-state='success'] { color: var(--ui-success); }
      .dsh-field-submit { margin-left: auto; flex: 0 0 auto; height: 30px; padding: 0 12px; border: 0; border-radius: 7px; background: var(--ui-brand); color: var(--ui-bg); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: transform .12s ease, filter .15s ease; }
      .dsh-access-buttons { display: flex; align-items: center; gap: 8px; margin-left: auto; }
      .dsh-access-field input:focus-visible, .dsh-access-field textarea:focus-visible, .dsh-access-button:focus-visible { outline: 2px solid var(--ui-brand); outline-offset: 2px; }
      .dsh-access-actions { display: flex; align-items: center; gap: 10px; min-height: 30px; }
      .dsh-access-actions > .dsh-field-message { flex: 1 1 auto; }
      .dsh-access-button { min-height: 30px; padding: 0 12px; border: 1px solid var(--ui-border); border-radius: 7px; color: var(--ui-text); background: var(--ui-surface); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
      .dsh-access-button-primary { color: var(--ui-bg); border-color: var(--ui-brand); background: var(--ui-brand); }
      .dsh-access-button:disabled { cursor: wait; opacity: .6; }
      .dsh-access-status { min-height: 20px; margin: 0; color: var(--ui-danger); font-size: 13px; }
      .dsh-access-status[data-kind='success'] { color: var(--ui-success); }
      @media (max-width: 620px) { .dsh-access-row { gap: 6px; } }
    `;

    let translate = (key) => key;

    function AccessSettings({ close }) {
      const [username, setUsername] = React.useState('');
      const [currentPassword, setCurrentPassword] = React.useState('');
      const [newPassword, setNewPassword] = React.useState('');
      const [confirmPassword, setConfirmPassword] = React.useState('');
      const [backgroundUrl, setBackgroundUrl] = React.useState('');
      const [backgroundFile, setBackgroundFile] = React.useState(null);
      const [customHtml, setCustomHtml] = React.useState('');
      const [turnstileConfigured, setTurnstileConfigured] = React.useState(false);
      const [turnstileSiteKey, setTurnstileSiteKey] = React.useState('');
      const [turnstileSecretKey, setTurnstileSecretKey] = React.useState('');
      const [turnstilePassword, setTurnstilePassword] = React.useState('');
      const [accountStatus, setAccountStatus] = React.useState({ text: '', kind: 'error' });
      const [appearanceStatus, setAppearanceStatus] = React.useState({ text: '', kind: 'error' });
      const [turnstileStatusMessage, setTurnstileStatusMessage] = React.useState({ text: '', kind: 'error' });
      const [sessionStatus, setSessionStatus] = React.useState({ text: '', kind: 'error' });
      const [fieldStates, setFieldStates] = React.useState({});
      const [busy, setBusy] = React.useState(false);
      const [loading, setLoading] = React.useState(true);
      const turnstileCheckId = React.useRef('');
      const turnstileTimeout = React.useRef(0);

      React.useEffect(() => {
        const onMessage = (event) => {
          if (event.origin !== window.location.origin || event.data?.type !== 'dsh-turnstile-key-check-result') return;
          if (!turnstileCheckId.current || event.data.id !== turnstileCheckId.current) return;
          turnstileCheckId.current = '';
          window.clearTimeout(turnstileTimeout.current);
          setBusy(false);
          setTurnstilePassword('');
          setTurnstileSiteKey('');
          setTurnstileSecretKey('');
          if (event.data.ok) {
            setTurnstileConfigured(true);
            setTurnstileStatusMessage({ text: 'keyCheckSaved', kind: 'success' });
            for (const name of ['turnstileSiteKey', 'turnstileSecretKey', 'turnstilePassword']) setField(name, { kind: 'success', message: '' });
          } else {
            setTurnstileStatusMessage({ text: 'keyCheckFailed', kind: 'error' });
            for (const name of ['turnstileSiteKey', 'turnstileSecretKey', 'turnstilePassword']) setField(name, { kind: 'error', message: tx('keyCheckFailed') });
          }
        };
        window.addEventListener('message', onMessage);
        return () => {
          window.removeEventListener('message', onMessage);
          window.clearTimeout(turnstileTimeout.current);
        };
      }, []);

      React.useEffect(() => {
        let active = true;
        fetch('/auth/admin', { credentials: 'same-origin', cache: 'no-store' })
          .then(async (response) => {
            if (!response.ok) throw new Error('load');
            return response.json();
          })
          .then((data) => {
            if (!active) return;
            setUsername(data.username || '');
            setBackgroundUrl(data.backgroundUrl || '');
            setCustomHtml(data.customHtml || '');
            setTurnstileConfigured(Boolean(data.turnstileConfigured));
          })
          .catch(() => { if (active) setAccountStatus({ text: 'load', kind: 'error' }); })
          .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
      }, []);

      const submit = async (event) => {
        event.preventDefault();
        setAccountStatus({ text: '', kind: 'error' });
        const accountChecks = {
          currentPassword: [Boolean(currentPassword), tx('currentRequired')],
          username: [/^[A-Za-z0-9._-]{1,64}$/.test(username), tx('usernameHint')],
          newPassword: [!newPassword || newPassword.length >= 12, tx('passwordHint')],
          confirmPassword: [newPassword === confirmPassword, tx('passwordMismatch')],
        };
        let accountValid = true;
        for (const [name, [valid, message]] of Object.entries(accountChecks)) {
          setField(name, { kind: valid ? 'idle' : 'error', message: valid ? '' : message });
          accountValid &&= valid;
        }
        if (!accountValid) return;
        setBusy(true);
        setAccountStatus({ text: '', kind: 'error' });
        try {
          const response = await fetch('/auth/admin/update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, username, newPassword }),
          });
          if (!response.ok) throw new Error('update');
          setAccountStatus({ text: 'saved', kind: 'success' });
          for (const name of Object.keys(accountChecks)) setField(name, { kind: 'success', message: '' });
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          window.setTimeout(() => window.location.replace('/auth/login'), 900);
        } catch {
          setAccountStatus({ text: 'updateFailed', kind: 'error' });
          setField('currentPassword', { kind: 'error', message: tx('updateFailed') });
        } finally {
          setBusy(false);
        }
      };

      const saveAppearance = async () => {
        setAppearanceStatus({ text: '', kind: 'error' });
        let backgroundValid = true;
        try {
          if (backgroundUrl.trim()) {
            const parsed = new URL(backgroundUrl.trim());
            backgroundValid = parsed.protocol === 'https:' || parsed.hostname.toLowerCase() === '3650000.xyz';
          }
        } catch { backgroundValid = false; }
        const fileValid = !backgroundFile || (backgroundFile.size <= 4 * 1024 * 1024 && ['image/png', 'image/jpeg', 'image/webp'].includes(backgroundFile.type));
        const appearanceChecks = {
          backgroundUrl: [backgroundValid, tx('backgroundHint')],
          backgroundFile: [fileValid, tx('invalidImage')],
          customHtml: [customHtml.length <= 32768, tx('customHtmlHint')],
        };
        let appearanceValid = true;
        for (const [name, [valid, message]] of Object.entries(appearanceChecks)) {
          setField(name, { kind: valid ? 'idle' : 'error', message: valid ? '' : message });
          appearanceValid &&= valid;
        }
        if (!appearanceValid) return;
        setBusy(true);
        setAppearanceStatus({ text: '', kind: 'error' });
        try {
          const nextBackgroundUrl = backgroundFile ? await uploadBackground(backgroundFile) : backgroundUrl;
          const response = await fetch('/auth/admin/preferences', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backgroundUrl: nextBackgroundUrl, customHtml }),
          });
          if (!response.ok) throw new Error('appearance');
          setBackgroundUrl(nextBackgroundUrl);
          setBackgroundFile(null);
          setAppearanceStatus({ text: customHtml.trim() ? 'customHtmlSaved' : 'backgroundSaved', kind: 'success' });
          setField('backgroundUrl', { kind: 'success', message: '' });
          setField('backgroundFile', { kind: 'success', message: '' });
          setField('customHtml', { kind: 'success', message: '' });
        } catch {
          setAppearanceStatus({ text: 'appearanceFailed', kind: 'error' });
          setField(backgroundFile ? 'backgroundFile' : 'backgroundUrl', { kind: 'error', message: tx(backgroundFile ? 'backgroundUploadFailed' : 'appearanceFailed') });
        } finally {
          setBusy(false);
        }
      };

      const uploadBackground = async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        const response = await fetch('/auth/admin/background', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data: btoa(binary) }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'upload');
        return data.backgroundUrl;
      };

      const verifyTurnstileKeys = async () => {
        setTurnstileStatusMessage({ text: '', kind: 'error' });
        const keyChecks = {
          turnstileSiteKey: [Boolean(turnstileSiteKey.trim()), tx('keyFieldsRequired')],
          turnstileSecretKey: [Boolean(turnstileSecretKey.trim()), tx('keyFieldsRequired')],
          turnstilePassword: [Boolean(turnstilePassword), tx('keyFieldsRequired')],
        };
        let keysValid = true;
        for (const [name, [valid, message]] of Object.entries(keyChecks)) {
          setField(name, { kind: valid ? 'idle' : 'error', message: valid ? '' : message });
          keysValid &&= valid;
        }
        if (!keysValid) return;
        const popup = window.open('about:blank', '_blank');
        if (!popup) {
          setTurnstileStatusMessage({ text: 'keyStartFailed', kind: 'error' });
          return;
        }
        setBusy(true);
        setTurnstileStatusMessage({ text: '', kind: 'error' });
        try {
          const response = await fetch('/auth/admin/turnstile/start', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: turnstilePassword, siteKey: turnstileSiteKey, secretKey: turnstileSecretKey }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'start');
          turnstileCheckId.current = data.id;
          popup.location.replace(new URL(data.checkUrl, window.location.href).href);
          turnstileTimeout.current = window.setTimeout(() => {
            if (turnstileCheckId.current !== data.id) return;
            turnstileCheckId.current = '';
            setBusy(false);
            setTurnstilePassword('');
            setTurnstileSiteKey('');
            setTurnstileSecretKey('');
            setTurnstileStatusMessage({ text: 'keyCheckFailed', kind: 'error' });
            for (const name of ['turnstileSiteKey', 'turnstileSecretKey', 'turnstilePassword']) setField(name, { kind: 'error', message: tx('keyCheckFailed') });
          }, 5 * 60 * 1000);
          setTurnstileStatusMessage({ text: 'keyCheckMessage', kind: 'success' });
        } catch {
          popup.close();
          setBusy(false);
          setTurnstileStatusMessage({ text: 'keyStartFailed', kind: 'error' });
        }
      };

      const signOut = async () => {
        if (!window.confirm(tx('confirmSignOut'))) return;
        setBusy(true);
        setSessionStatus({ text: '', kind: 'error' });
        try {
          const response = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
          if (!response.ok) throw new Error('logout');
          setSessionStatus({ text: 'signedOut', kind: 'success' });
          window.location.replace('/auth/login');
        } catch {
          setSessionStatus({ text: 'signOutFailed', kind: 'error' });
        } finally {
          setBusy(false);
        }
      };

      const tx = (key) => translate(key);
      const setField = (name, state) => setFieldStates((current) => ({ ...current, [name]: state }));
      const checkField = (name, value, validate) => {
        const valid = validate(value);
        if (valid && fieldStates[name]?.kind === 'error') setField(name, { kind: 'idle', message: '' });
        return valid;
      };
      const markField = (name) => {
        const state = fieldStates[name] || { kind: 'idle' };
        if (state.kind === 'success') return h('span', { className: 'dsh-field-mark', 'data-state': 'success', 'aria-hidden': true, dangerouslySetInnerHTML: { __html: '<svg viewBox="0 0 24 24" focusable="false"><path d="M5.5 12.5l4.2 4.1 8.8-9.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' } });
        if (state.kind === 'error') return h('span', { className: 'dsh-field-mark', 'data-state': 'error', 'aria-hidden': true }, '!');
        return null;
      };
      const fieldMessage = (name, fallback) => {
        const state = fieldStates[name] || { kind: 'idle' };
        return h('p', { className: 'dsh-field-message', 'data-state': state.kind, id: `dsh-field-${name}-message`, 'aria-live': 'polite' }, state.message || fallback);
      };
      const inputProps = (name, value, onChange, extra = {}, validate = (next) => Boolean(next)) => ({ ...extra, value, 'data-field-state': fieldStates[name]?.kind || 'idle', 'aria-invalid': fieldStates[name]?.kind === 'error' ? 'true' : 'false', 'aria-describedby': `dsh-field-${name}-message`, onChange: (event) => { onChange(event); const state = fieldStates[name]?.kind; if (state === 'error') checkField(name, event.target.value, validate); else if (state === 'success') setField(name, { kind: 'idle', message: '' }); } });

      const fieldBox = (name, input, fallback) => h(React.Fragment, null,
        h('div', { className: 'dsh-access-box', 'data-state': fieldStates[name]?.kind || 'idle' }, input, markField(name)),
        fieldMessage(name, fallback),
      );
      const renderStatus = (state, fallback = '') => {
        const text = state.text === 'load' ? 'loadError' : state.text;
        return h('p', { className: 'dsh-field-message', 'data-state': state.text ? state.kind : 'idle', role: 'status', 'aria-live': 'polite' }, text ? tx(text) : fallback);
      };
      const actionLine = (state, fallback, button) => h('div', { className: 'dsh-access-actions' }, renderStatus(state, fallback), button);
      return h(React.Fragment, null,
        h('style', null, css),
        h('section', { className: 'dsh-access-page' },
          h('header', null,
            h('h2', { className: 'dsh-access-title' }, tx('title')),
            h('p', { className: 'dsh-access-intro' }, tx('intro')),
          ),
          h('div', { className: 'dsh-access-block' },
            h('h3', null, tx('currentAccount')),
            h('div', { className: 'dsh-access-row' },
              h('label', null, tx('username')),
              h('div', { className: 'dsh-access-field' },
                h('span', { 'aria-live': 'polite' }, loading ? '…' : username),
              ),
            ),
          ),
          h('form', { className: 'dsh-access-block', onSubmit: submit },
            h('h3', null, tx('updateTitle')),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-current' }, tx('currentPassword')),
              h('div', { className: 'dsh-access-field' }, fieldBox('currentPassword', h('input', inputProps('currentPassword', currentPassword, (e) => setCurrentPassword(e.target.value), { id: 'dsh-access-current', type: 'password', autoComplete: 'current-password' }, (value) => Boolean(value))), tx('currentRequired'))),
            ),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-username' }, tx('username')),
              h('div', { className: 'dsh-access-field' },
                fieldBox('username', h('input', inputProps('username', username, (e) => setUsername(e.target.value), { id: 'dsh-access-username', autoComplete: 'username', maxLength: 64 }, (value) => /^[A-Za-z0-9._-]{1,64}$/.test(value))), tx('usernameHint')),
              ),
            ),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-new-password' }, tx('newPassword')),
              h('div', { className: 'dsh-access-field' },
                fieldBox('newPassword', h('input', inputProps('newPassword', newPassword, (e) => {
                  const value = e.target.value;
                  setNewPassword(value);
                  if (fieldStates.confirmPassword?.kind === 'error' && confirmPassword === value) setField('confirmPassword', { kind: 'idle', message: '' });
                }, { id: 'dsh-access-new-password', type: 'password', autoComplete: 'new-password', maxLength: 1024 }, (value) => !value || value.length >= 12)), tx('passwordHint')),
              ),
            ),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-confirm-password' }, tx('confirmPassword')),
              h('div', { className: 'dsh-access-field' }, fieldBox('confirmPassword', h('input', inputProps('confirmPassword', confirmPassword, (e) => setConfirmPassword(e.target.value), { id: 'dsh-access-confirm-password', type: 'password', autoComplete: 'new-password', maxLength: 1024 }, (value) => value === newPassword)), tx('passwordMismatch'))),
            ),
            actionLine(accountStatus, tx('passwordHint'), h('button', { className: 'dsh-access-button dsh-access-button-primary dsh-field-submit', type: 'submit', disabled: busy || loading }, busy ? tx('saving') : tx('save'))),
          ),
          h('section', { className: 'dsh-access-block' },
            h('h3', null, tx('loginPageTitle')),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-background-url' }, tx('backgroundUrl')),
              h('div', { className: 'dsh-access-field' },
                fieldBox('backgroundUrl', h('input', inputProps('backgroundUrl', backgroundUrl, (e) => setBackgroundUrl(e.target.value), { id: 'dsh-access-background-url', type: 'text', inputMode: 'url', maxLength: 2048, placeholder: 'http://3650000.xyz/api/?type=img&mode=3,5,7,8,9' }, (value) => { if (!value.trim()) return true; try { const url = new URL(value.trim()); return url.protocol === 'https:' || url.hostname.toLowerCase() === '3650000.xyz'; } catch { return false; } })), tx('backgroundHint')),
              ),
            ),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-background-file' }, tx('uploadImage')),
              h('div', { className: 'dsh-access-field' }, fieldBox('backgroundFile', h('input', {
                id: 'dsh-access-background-file', type: 'file', accept: 'image/png,image/jpeg,image/webp', disabled: busy,
                'data-field-state': fieldStates.backgroundFile?.kind || 'idle',
                'aria-invalid': fieldStates.backgroundFile?.kind === 'error' ? 'true' : 'false',
                'aria-describedby': 'dsh-field-backgroundFile-message',
                onChange: (event) => {
                  const file = event.target.files?.[0] || null;
                  event.target.value = '';
                  setBackgroundFile(file);
                  if (!file && fieldStates.backgroundFile?.kind === 'error') {
                    checkField('backgroundFile', null, () => true);
                  } else if (file && fieldStates.backgroundFile?.kind === 'error' && file.size <= 4 * 1024 * 1024 && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                    checkField('backgroundFile', file, (candidate) => candidate.size <= 4 * 1024 * 1024 && ['image/png', 'image/jpeg', 'image/webp'].includes(candidate.type));
                  } else if (fieldStates.backgroundFile?.kind === 'success') {
                    setField('backgroundFile', { kind: 'idle', message: '' });
                  }
                },
              }), tx('invalidImage'))),
            ),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-custom-html' }, tx('customHtml')),
              h('div', { className: 'dsh-access-field' },
                fieldBox('customHtml', h('textarea', inputProps('customHtml', customHtml, (e) => setCustomHtml(e.target.value), { id: 'dsh-access-custom-html', maxLength: 32768, rows: 12, spellCheck: false, autoCapitalize: 'off', autoComplete: 'off' }, (value) => value.length <= 32768)), tx('customHtmlHint')),
              ),
            ),
            actionLine(appearanceStatus, tx('backgroundHint'), h('div', { className: 'dsh-access-buttons' },
              h('button', { className: 'dsh-access-button dsh-access-button-primary dsh-field-submit', type: 'button', disabled: busy || loading, onClick: saveAppearance }, tx('saveAppearance')),
              h('button', { className: 'dsh-access-button', type: 'button', disabled: loading, onClick: () => window.open('/auth/login', '_blank', 'noopener,noreferrer') }, tx('previewLogin')),
            )),
          ),
          h('section', { className: 'dsh-access-block' },
            h('h3', null, tx('turnstileTitle')),
            h('p', { className: 'dsh-access-hint' }, turnstileConfigured ? tx('turnstileStatus') : tx('turnstileHint')),
            h('p', { className: 'dsh-access-hint' }, tx('rotationBackupInfo')),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-new-site-key' }, tx('turnstileSiteKey')),
              h('div', { className: 'dsh-access-field' }, fieldBox('turnstileSiteKey', h('input', inputProps('turnstileSiteKey', turnstileSiteKey, (e) => setTurnstileSiteKey(e.target.value), { id: 'dsh-access-new-site-key', autoComplete: 'off', maxLength: 256 }, (value) => Boolean(value.trim()))), tx('keyFieldsRequired'))),
            ),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-new-secret-key' }, tx('turnstileSecretKey')),
              h('div', { className: 'dsh-access-field' }, fieldBox('turnstileSecretKey', h('input', inputProps('turnstileSecretKey', turnstileSecretKey, (e) => setTurnstileSecretKey(e.target.value), { id: 'dsh-access-new-secret-key', type: 'password', autoComplete: 'new-password', maxLength: 512 }, (value) => Boolean(value.trim()))), tx('keyFieldsRequired'))),
            ),
            h('div', { className: 'dsh-access-row' },
              h('label', { htmlFor: 'dsh-access-turnstile-password' }, tx('turnstilePassword')),
              h('div', { className: 'dsh-access-field' }, fieldBox('turnstilePassword', h('input', inputProps('turnstilePassword', turnstilePassword, (e) => setTurnstilePassword(e.target.value), { id: 'dsh-access-turnstile-password', type: 'password', autoComplete: 'current-password' }, (value) => Boolean(value))), tx('keyFieldsRequired'))),
            ),
            actionLine(turnstileStatusMessage, tx('turnstileHint'), h('button', { className: 'dsh-access-button dsh-access-button-primary dsh-field-submit', type: 'button', disabled: busy || loading, onClick: verifyTurnstileKeys }, busy ? tx('verifyingKeys') : tx('verifyKeys'))),
          ),
          h('div', { className: 'dsh-access-block' },
            h('h3', null, tx('signOutTitle')),
            actionLine(sessionStatus, '', h('button', { className: 'dsh-access-button dsh-field-submit', type: 'button', disabled: busy || loading, onClick: signOut }, busy ? tx('signingOut') : tx('signOut'))),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        translate = t;
        ctx.effect(() => ctx.locale.register(NS, dictionaries), '@local/dsh-login-gateway locale');
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-login-gateway',
          order: 45,
          label: () => t('nav'),
          locale: NS,
        }, AccessSettings));
      },
    };
  },
});
