/* ============================================
   MIDWEST PSYCH FEST — Deploy Status Badge
   Fetches the latest GitHub Actions run status
   and renders a badge in #deployStatus.
   Repo is read from document.body.dataset.repo
   e.g. data-repo="bunjumun/MidwestPsychFest"
   ============================================ */

(async function initDeployBadge() {
  const container = document.getElementById('deployStatus');
  if (!container) return;

  const repo = document.body.dataset.repo;
  if (!repo) return;

  const ICONS = {
    success:     '✅',
    failure:     '❌',
    in_progress: '⏳',
    queued:      '🔄',
    cancelled:   '⛔',
    skipped:     '⏭',
  };

  container.innerHTML = '<span class="deploy-badge">⏳ Checking deploy status…</span>';

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=1`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    const run  = data.workflow_runs?.[0];

    if (!run) {
      container.innerHTML = '<span class="deploy-badge">No deploy runs found</span>';
      return;
    }

    const status    = run.conclusion || run.status || 'unknown';
    const icon      = ICONS[status] || '❓';
    const timeAgo   = relativeTime(run.updated_at);
    const runUrl    = run.html_url;
    const branch    = run.head_branch;
    const commitMsg = run.head_commit?.message?.split('\n')[0] || '';

    container.innerHTML = `
      <a href="${runUrl}" target="_blank" rel="noopener"
         class="deploy-badge ${status}" style="text-decoration:none;">
        ${icon} Deploy: <strong>${status}</strong>
        &nbsp;·&nbsp; ${timeAgo}
        &nbsp;·&nbsp; <code style="font-size:0.72rem;">${branch}</code>
        ${commitMsg ? `&nbsp;·&nbsp; <span style="opacity:0.7;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;">${escHtml(commitMsg)}</span>` : ''}
      </a>`;
  } catch(e) {
    container.innerHTML = `<span class="deploy-badge" title="${e.message}">⚠ Deploy status unavailable</span>`;
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
