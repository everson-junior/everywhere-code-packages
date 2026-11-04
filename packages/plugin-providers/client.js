window.__ModuleLoader__.load({
  id: '@everywhere-harness/plugin-providers',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState } = React;
    const BASE = 'http://127.0.0.1:3005';
    const AUTH = 'Bearer antigravity-proxy-internal';

    function buttonStyle(background) {
      return { flex: '0 0 auto', padding: '7px 11px', border: 0, borderRadius: 6, background, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
    }

    function AntigravityProviderCard({ provider }) {
      // One keyed extension serves the llm-pi-ai adapter family; keep this
      // control exclusive to the Antigravity provider row.
      if (provider?.provider !== 'antigravity') return null;
      return h(AntigravityAccount);
    }

    function AntigravityAccount() {
      const [status, setStatus] = useState({ connected: false, email: '', project_id: '' });
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState('');

      const refresh = async () => {
        try {
          const response = await fetch(`${BASE}/internal/oauth/status`);
          if (!response.ok) throw new Error(`Status HTTP ${response.status}`);
          setStatus(await response.json());
        } catch (error) {
          setNotice(`Não foi possível consultar o login: ${String(error?.message || error)}`);
        }
      };

      useEffect(() => {
        refresh();
        const interval = window.setInterval(refresh, 2500);
        return () => window.clearInterval(interval);
      }, []);

      const run = async (path, success) => {
        setBusy(true);
        setNotice('');
        // Open synchronously from the click event so popup blockers allow it.
        const popup = path.endsWith('/start') ? window.open('about:blank', '_blank') : null;
        try {
          const response = await fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: AUTH } });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
          if (popup) {
            if (!body?.url) throw new Error('O servidor não retornou a URL de login.');
            popup.location.replace(body.url);
          }
          setNotice(success);
          await refresh();
        } catch (error) {
          if (popup) popup.close();
          setNotice(`Erro: ${String(error?.message || error)}`);
        } finally {
          setBusy(false);
        }
      };

      const button = status.connected
        ? h('button', {
          type: 'button', disabled: busy,
          onClick: () => run('/internal/oauth/logout', 'Conta Antigravity desconectada.'),
          style: buttonStyle('#b42318'),
        }, busy ? 'Desconectando…' : 'Desconectar Antigravity')
        : h('button', {
          type: 'button', disabled: busy,
          onClick: () => run('/internal/oauth/start', 'O navegador foi aberto para o login Google.'),
          style: buttonStyle('#155eef'),
        }, busy ? 'Abrindo login…' : 'Conectar Antigravity');

      return h('div', { style: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--dsh-border, #e5e7eb)' } }, [
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } }, [
          h('div', { style: { minWidth: 0 } }, [
            h('div', { style: { fontWeight: 600, fontSize: 13 } }, status.connected ? 'Conta Google conectada' : 'Conecte sua conta Google'),
            h('div', { style: { marginTop: 3, color: 'var(--dsh-text-muted, #64748b)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' } },
              status.connected ? `${status.email || 'Conta Google'} · ${status.project_id || 'Cloud Code'}` : 'Faça login para ativar os modelos Antigravity.'),
          ]),
          button,
        ]),
        notice ? h('div', { role: 'status', style: { marginTop: 8, fontSize: 12, color: notice.startsWith('Erro:') || notice.startsWith('Não foi') ? '#b42318' : '#067647' } }, notice) : null,
      ]);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // The packaged bundle owns its route through `antigravity-llm-pi-ai`.
        // Keep legacy keys for profiles configured before this self-contained bundle.
        ctx.slots.inject('settings.models.provider-card', () => {
          const keys = ['antigravity-llm-pi-ai', 'llm-pi-ai', 'include:llm-pi-ai'];
          const disposers = keys.map((key) => ctx.slots.register({
            name: 'settings.models.provider-card', key,
          }, AntigravityProviderCard));
          return () => disposers.forEach((dispose) => dispose());
        });
      },
    };
  },
});
