// ============================================================
// TA-Intake Portal — Team Dashboard Application Logic
// ============================================================

(function() {
  'use strict';

  // ===== Cloudflare Worker API Configuration =====
  // Replace with your actual Worker URL after deployment
  var API_BASE_URL = 'https://ta-intake-api.linda-yuss.workers.dev';
  var API_ENABLED = true;

  // ===== State =====
  var cases = [];
  var currentFilter = 'all';
  var currentDeadlineFilter = 'all';
  var currentLawFilter = 'all';

  // ===== API Integration =====
  function fetchSubmissions() {
    if (!API_ENABLED || !API_BASE_URL) return Promise.resolve([]);

    return fetch(API_BASE_URL + '/api/submissions')
      .then(function(res) {
        if (!res.ok) throw new Error('API request failed');
        return res.json();
      })
      .catch(function(err) {
        console.error('Failed to fetch submissions:', err);
        return [];
      });
  }

  function importSubmissionToCase(submission) {
    var caseObj = {
      id: submission._meta && submission._meta.case_id ? submission._meta.case_id : submission.id || ('TA-' + Date.now()),
      importTime: submission.timestamp || new Date().toISOString(),
      status: submission.status || 'intake',
      source: submission,
      basicInfo: submission.sections ? submission.sections.basic_info : {},
      accident: submission.sections ? submission.sections.accident : {},
      injury: submission.sections ? (submission.sections.injury || {}) : {},
      injury_persons: submission.sections ? (submission.sections.injury_persons || []) : [],
      nursing: submission.sections ? (submission.sections.nursing || {}) : {},
      deadlines: submission.deadline_reminders || [],
      demands: submission.sections ? submission.sections.demands : {},
      litigation: submission.sections ? submission.sections.litigation : {},
      materials: submission.sections ? submission.sections.materials : {}
    };

    // Check for duplicate
    var existing = cases.findIndex(function(c) { return c.id === caseObj.id; });
    if (existing >= 0) {
      cases[existing] = Object.assign(cases[existing], caseObj);
    } else {
      cases.push(caseObj);
    }
  }

  // ===== Init =====
  function init() {
    loadCases();
    loadTeamConfig();
    renderDashboard();
    renderLaws('all');
    renderCompensationTable();
    renderFeeTable();
    renderCompStandards();
    initTheme();
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
  }

  // ===== Theme =====
  function initTheme() {
    var toggle = document.getElementById('themeToggle');
    var saved = null;
    try { saved = localStorage.getItem('ta-theme'); } catch(e) {}
    if (saved) applyTheme(saved);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');

    toggle.addEventListener('click', function() {
      var cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var toggle = document.getElementById('themeToggle');
    if (toggle) toggle.textContent = theme === 'dark' ? '\u2600' : '\u263E';
    try { localStorage.setItem('ta-theme', theme); } catch(e) {}
  }

  // ===== Router =====
  function handleRoute() {
    var hash = (location.hash.replace('#', '') || '/');
    var viewMap = {
      '/': 'view-dashboard',
      '/cases': 'view-cases',
      '/deadlines': 'view-deadlines',
      '/laws': 'view-laws',
      '/compensation': 'view-compensation',
      '/reports': 'view-reports',
      '/settings': 'view-settings'
    };
    var titleMap = {
      '/': '仪表盘',
      '/cases': '案件看板',
      '/deadlines': '期限管理',
      '/laws': '法规速查',
      '/compensation': '赔偿计算',
      '/reports': '报告工作台',
      '/settings': '设置'
    };

    document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
    var viewId = viewMap[hash] || 'view-dashboard';
    var view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    document.getElementById('pageTitle').textContent = titleMap[hash] || '仪表盘';

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(item) {
      item.classList.remove('active');
      if (item.getAttribute('data-route') === hash) item.classList.add('active');
    });

    // Refresh views
    if (hash === '/cases') renderCaseList();
    if (hash === '/deadlines') renderDeadlineList();
    if (hash === '/') renderDashboard();
    if (hash === '/reports') refreshReportSelects();
  }

  function navigate(el) {
    if (!el) return;
    closeSidebar();
  }

  // ===== Sidebar Mobile =====
  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }

  // ===== Data Persistence =====
  function loadCases() {
    try {
      var stored = localStorage.getItem('ta-cases');
      if (stored) cases = JSON.parse(stored);
    } catch(e) { cases = []; }

    // Fetch from API and merge
    if (API_ENABLED && API_BASE_URL) {
      fetchSubmissions().then(function(submissions) {
        if (submissions && submissions.length > 0) {
          var newCount = 0;
          submissions.forEach(function(sub) {
            var exists = cases.some(function(c) {
              return c.id === (sub._meta && sub._meta.case_id ? sub._meta.case_id : sub.id);
            });
            if (!exists) {
              importSubmissionToCase(sub);
              newCount++;
            }
          });
          if (newCount > 0) {
            saveCases();
            renderDashboard();
            console.log('Auto-synced ' + newCount + ' new submissions from API');
          }
        }
      });
    }
  }

  function saveCases() {
    try { localStorage.setItem('ta-cases', JSON.stringify(cases)); } catch(e) {}
  }

  function loadTeamConfig() {
    try {
      var cfg = localStorage.getItem('ta-team-config');
      if (cfg) {
        cfg = JSON.parse(cfg);
        if (cfg.firmName) document.getElementById('cfgFirmName').value = cfg.firmName;
        if (cfg.teamName) document.getElementById('cfgTeamName').value = cfg.teamName;
        if (cfg.contact) document.getElementById('cfgContact').value = cfg.contact;
        if (cfg.phone) document.getElementById('cfgPhone').value = cfg.phone;
      }
    } catch(e) {}
  }

  // ===== Import Questionnaire JSON =====
  function importQuestionnaire(files) {
    if (!files || files.length === 0) return;

    Array.from(files).forEach(function(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          var caseObj = {
            id: data._meta && data._meta.case_id ? data._meta.case_id : 'TA-' + Date.now(),
            importTime: new Date().toISOString(),
            status: 'intake',
            source: data,
            basicInfo: data.sections ? data.sections.basic_info : {},
            accident: data.sections ? data.sections.accident : {},
            injury: data.sections ? (data.sections.injury || {}) : {},
            injury_persons: data.sections ? (data.sections.injury_persons || []) : [],
            nursing: data.sections ? (data.sections.nursing || {}) : {},
            deadlines: data.deadline_reminders || [],
            demands: data.sections ? data.sections.demands : {},
            litigation: data.sections ? data.sections.litigation : {},
            materials: data.sections ? data.sections.materials : {}
          };

          // Check for duplicate
          var existing = cases.findIndex(function(c) { return c.id === caseObj.id; });
          if (existing >= 0) {
            cases[existing] = Object.assign(cases[existing], caseObj);
          } else {
            cases.push(caseObj);
          }

          saveCases();
          renderDashboard();
          alert('导入成功：' + (caseObj.basicInfo.name || caseObj.id));
        } catch(err) {
          alert('导入失败：' + file.name + ' 格式错误');
        }
      };
      reader.readAsText(file);
    });

    // Reset file input
    var inputs = document.querySelectorAll('input[type=file]');
    inputs.forEach(function(inp) { inp.value = ''; });
  }

  // ===== Export =====
  function exportAllData() {
    if (cases.length === 0) { alert('暂无案件数据可导出'); return; }
    var blob = new Blob([JSON.stringify({ cases: cases, exportTime: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '交通事故案件数据_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function clearAllData() {
    if (!confirm('确定要清空全部案件数据吗？此操作不可恢复。')) return;
    cases = [];
    saveCases();
    renderDashboard();
    alert('已清空全部数据');
  }

  // ===== Team Config =====
  function saveTeamConfig() {
    var cfg = {
      firmName: document.getElementById('cfgFirmName').value.trim(),
      teamName: document.getElementById('cfgTeamName').value.trim(),
      contact: document.getElementById('cfgContact').value.trim(),
      phone: document.getElementById('cfgPhone').value.trim()
    };
    try { localStorage.setItem('ta-team-config', JSON.stringify(cfg)); } catch(e) {}
    alert('配置已保存');
  }

  // ===== Dashboard Rendering =====
  function renderDashboard() {
    var total = cases.length;
    var intake = cases.filter(function(c) { return c.status === 'intake'; }).length;
    var filing = cases.filter(function(c) { return c.status === 'filing'; }).length;

    // Count urgent deadlines
    var urgentCount = 0;
    cases.forEach(function(c) {
      (c.deadlines || []).forEach(function(d) {
        if (d.urgent) urgentCount++;
      });
    });

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statIntake').textContent = intake;
    document.getElementById('statFiling').textContent = filing;
    document.getElementById('statUrgent').textContent = urgentCount;

    var badge = document.getElementById('deadlineBadge');
    if (urgentCount > 0) {
      badge.textContent = urgentCount;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }

    // Recent cases (top 5)
    var recentDiv = document.getElementById('recentCases');
    if (cases.length === 0) {
      recentDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128194;</div><div class="empty-text">暂无案件，导入问询单开始使用</div>' +
        '<label class="btn btn-primary" style="cursor:pointer;">导入问询单 JSON<input type="file" accept=".json" multiple style="display:none" onchange="importQuestionnaire(this.files)"></label></div>';
    } else {
      var sorted = cases.slice().sort(function(a, b) { return (b.importTime || '').localeCompare(a.importTime || ''); });
      var html = '';
      sorted.slice(0, 5).forEach(function(c) {
        var statusBadge = getStatusBadge(c.status);
        var name = c.basicInfo.name || '未知';
        var accidentDate = c.accident.date || '—';
        var liability = c.accident.liability || '—';
        html += '<div class="case-card">' +
          '<div class="case-info">' +
            '<div class="case-name">' + escHtml(name) + ' ' + statusBadge + '</div>' +
            '<div class="case-meta"><span>事故：' + escHtml(accidentDate) + '</span><span>责任：' + escHtml(liability) + '</span><span>编号：' + escHtml(c.id) + '</span></div>' +
          '</div>' +
          '<button class="btn btn-sm btn-ghost" onclick="updateCaseStatus(\'' + c.id + '\')" title="变更状态">&#9998;</button>' +
        '</div>';
      });
      recentDiv.innerHTML = html;
    }

    // Recent deadlines
    var recentDl = document.getElementById('recentDeadlines');
    var allDeadlines = [];
    cases.forEach(function(c) {
      (c.deadlines || []).forEach(function(d) {
        allDeadlines.push(Object.assign({}, d, { caseId: c.id, caseName: c.basicInfo.name || c.id }));
      });
    });
    allDeadlines.sort(function(a, b) { return (a.urgent ? 0 : 1) - (b.urgent ? 0 : 1); });

    if (allDeadlines.length === 0) {
      recentDl.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-text" style="font-size:13px;">导入案件后自动计算关键期限</div></div>';
    } else {
      var dlHtml = '';
      allDeadlines.slice(0, 5).forEach(function(d) {
        var level = d.urgent ? 'danger' : 'safe';
        dlHtml += '<div class="deadline-item">' +
          '<div class="dl-indicator ' + level + '"></div>' +
          '<div class="dl-info"><div class="dl-title">' + escHtml(d.item) + '</div><div class="dl-legal">' + escHtml(d.caseName) + ' · ' + escHtml(d.legal_basis || '') + '</div></div>' +
          '<div class="dl-remaining deadline-' + level + '">' + escHtml(d.remaining || '') + '</div>' +
        '</div>';
      });
      recentDl.innerHTML = dlHtml;
    }
  }

  // ===== Case List =====
  function renderCaseList() {
    var filtered = currentFilter === 'all' ? cases : cases.filter(function(c) { return c.status === currentFilter; });
    var listDiv = document.getElementById('caseList');

    if (filtered.length === 0) {
      listDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128194;</div><div class="empty-text">' +
        (cases.length === 0 ? '暂无案件，请导入问询单 JSON' : '当前筛选条件下无案件') + '</div></div>';
      return;
    }

    var html = '';
    filtered.forEach(function(c) {
      var name = c.basicInfo.name || '未知';
      var statusBadge = getStatusBadge(c.status);
      var accidentDate = c.accident.date || '—';
      var liability = c.accident.liability || '—';
      var phone = c.basicInfo.phone || '';
      var injury = '';
      if (c.injury_persons && c.injury_persons.length > 0) {
        injury = c.injury_persons.map(function(p) {
          var parts = [];
          if (p.person_type === '死亡') {
            parts.push('死亡' + (p.name ? '(' + p.name + ')' : ''));
            if (p.death_cause) parts.push(p.death_cause);
          } else {
            if (p.diagnosis) parts.push(p.diagnosis);
          }
          if (p.age) parts.push(p.age + '岁');
          return parts.join(' ');
        }).filter(Boolean).join('；');
      } else if (c.injury && c.injury.diagnosis) {
        injury = c.injury.diagnosis;
      }
      var progress = getCaseProgress(c);

      html += '<div class="case-card">' +
        '<div class="case-info">' +
          '<div class="case-name">' + escHtml(name) + ' ' + statusBadge + '</div>' +
          '<div class="case-meta">' +
            '<span>事故：' + escHtml(accidentDate) + '</span>' +
            '<span>责任：' + escHtml(liability) + '</span>' +
            (phone ? '<span>电话：' + escHtml(phone) + '</span>' : '') +
            (injury ? '<span>诊断：' + escHtml(injury) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="case-progress">' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">进度 ' + progress + '%</div>' +
          '<div class="progress"><div class="progress-bar" style="width:' + progress + '%"></div></div>' +
        '</div>' +
        '<div style="display:flex;gap:4px;">' +
          '<button class="btn btn-sm btn-ghost" onclick="updateCaseStatus(\'' + c.id + '\')" title="变更状态">&#9998;</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="deleteCase(\'' + c.id + '\')" title="删除">&#128465;</button>' +
        '</div>' +
      '</div>';
    });
    listDiv.innerHTML = html;
  }

  function filterCases(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('#caseFilters .filter-tab').forEach(function(t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderCaseList();
  }

  function getCaseProgress(c) {
    var p = 0;
    if (c.basicInfo && c.basicInfo.name) p += 15;
    if (c.accident && c.accident.date) p += 15;
    var hasInjury = false;
    if (c.injury_persons && c.injury_persons.length > 0) {
      hasInjury = c.injury_persons.some(function(p) {
        return p.diagnosis || p.death_diagnosis || p.death_cause;
      });
    } else if (c.injury && c.injury.diagnosis) {
      hasInjury = true;
    }
    if (hasInjury) p += 15;
    if (c.litigation && c.litigation.status) p += 10;
    if (c.materials && c.materials.checklist && c.materials.checklist.length > 0) p += 15;
    if (c.deadlines && c.deadlines.length > 0) p += 10;
    if (c.status === 'filing') p = Math.max(p, 60);
    if (c.status === 'trial') p = Math.max(p, 80);
    if (c.status === 'closed') p = 100;
    return Math.min(p, 100);
  }

  function getStatusBadge(status) {
    var map = {
      intake: '<span class="badge badge-warning">接谈中</span>',
      filing: '<span class="badge badge-primary">已立案</span>',
      trial: '<span class="badge badge-info">庭审中</span>',
      closed: '<span class="badge badge-success">已结案</span>'
    };
    return map[status] || '<span class="badge badge-muted">未知</span>';
  }

  function updateCaseStatus(caseId) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c) return;
    var statuses = ['intake', 'filing', 'trial', 'closed'];
    var labels = ['接谈中', '已立案', '庭审中', '已结案'];
    var current = statuses.indexOf(c.status);
    var next = (current + 1) % statuses.length;
    if (confirm('将案件「' + (c.basicInfo.name || c.id) + '」状态变更为：' + labels[next] + '？')) {
      c.status = statuses[next];
      saveCases();
      renderDashboard();
      renderCaseList();
    }
  }

  function deleteCase(caseId) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c) return;
    if (confirm('确定删除案件「' + (c.basicInfo.name || c.id) + '」？此操作不可恢复。')) {
      cases = cases.filter(function(x) { return x.id !== caseId; });
      saveCases();
      renderDashboard();
      renderCaseList();
    }
  }

  // ===== Deadline List =====
  function renderDeadlineList() {
    var allDeadlines = [];
    cases.forEach(function(c) {
      (c.deadlines || []).forEach(function(d) {
        allDeadlines.push(Object.assign({}, d, { caseId: c.id, caseName: c.basicInfo.name || c.id }));
      });
    });

    var filtered = allDeadlines;
    if (currentDeadlineFilter === 'danger') filtered = allDeadlines.filter(function(d) { return d.urgent; });
    else if (currentDeadlineFilter === 'warn') filtered = allDeadlines.filter(function(d) { return !d.urgent && d.remaining && d.remaining.indexOf('剩余') >= 0; });
    else if (currentDeadlineFilter === 'safe') filtered = allDeadlines.filter(function(d) { return !d.urgent && (!d.remaining || d.remaining.indexOf('剩余') < 0); });

    var listDiv = document.getElementById('deadlineList');
    if (filtered.length === 0) {
      listDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9200;</div><div class="empty-text">暂无期限数据</div></div>';
      return;
    }

    var html = '';
    filtered.forEach(function(d) {
      var level = d.urgent ? 'danger' : 'safe';
      html += '<div class="deadline-item">' +
        '<div class="dl-indicator ' + level + '"></div>' +
        '<div class="dl-info">' +
          '<div class="dl-title">' + escHtml(d.item) + '</div>' +
          '<div class="dl-legal">' + escHtml(d.caseName) + ' · ' + escHtml(d.legal_basis || '') + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' + escHtml(d.note || '') + '</div>' +
        '</div>' +
        '<div class="dl-remaining">' +
          '<div class="deadline-' + level + '">' + escHtml(d.deadline || '') + '</div>' +
          '<div class="deadline-label">' + escHtml(d.remaining || '') + '</div>' +
        '</div>' +
      '</div>';
    });
    listDiv.innerHTML = html;
  }

  function filterDeadlines(filter, btn) {
    currentDeadlineFilter = filter;
    document.querySelectorAll('#deadlineFilters .filter-tab').forEach(function(t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderDeadlineList();
  }

  // ===== Legal Search =====
  function renderLaws(filter) {
    var listDiv = document.getElementById('lawList');
    var html = '';

    if (filter === 'all' || filter === '法律') {
      LEGAL_DATA.laws.forEach(function(law) {
        html += renderLawCard(law, '法律');
      });
    }
    if (filter === 'all' || filter === '司法解释') {
      LEGAL_DATA.judicialInterpretations.forEach(function(ji) {
        html += renderLawCard(ji, '司法解释');
      });
    }
    if (filter === 'all' || filter === '行政法规') {
      LEGAL_DATA.regulations.forEach(function(reg) {
        html += renderLawCard(reg, '行政法规');
      });
    }
    if (filter === '赔偿标准') {
      html += renderCompensationStandardsCard();
    }
    if (filter === '裁判观点') {
      html += renderJudicialTrendsCard();
      html += renderTypicalCasesCard();
    }

    // Always show deadlines reference
    if (filter === 'all') {
      html += renderDeadlinesRefCard();
    }

    listDiv.innerHTML = html;
  }

  function renderLawCard(item, category) {
    var badgeClass = category === '法律' ? 'badge-primary' : category === '司法解释' ? 'badge-info' : 'badge-warning';
    var points = item.keyPoints || [];
    var articles = item.articles || [];

    var bodyHtml = '';
    if (articles.length > 0) {
      bodyHtml += '<div style="margin-bottom:12px;">';
      articles.forEach(function(a) {
        bodyHtml += '<div style="margin-bottom:8px;padding:8px 12px;background:var(--bg);border-radius:var(--radius-sm);">' +
          '<strong>' + escHtml(a.no) + ' ' + escHtml(a.title) + '</strong>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">' + escHtml(a.summary) + '</div>' +
        '</div>';
      });
      bodyHtml += '</div>';
    }
    if (points.length > 0) {
      bodyHtml += '<div class="law-articles">';
      points.forEach(function(p) {
        bodyHtml += '<span class="article-tag">' + escHtml(p) + '</span>';
      });
      bodyHtml += '</div>';
    }

    return '<div class="law-card">' +
      '<div class="law-header">' +
        '<div class="law-title">' + escHtml(item.name) + '</div>' +
        '<span class="badge ' + badgeClass + '">' + category + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">' +
        escHtml(item.version || '') + ' · 来源：' + escHtml(item.source || '') +
        (item.sourceUrl ? ' · <a href="' + item.sourceUrl + '" target="_blank">查看原文 &rarr;</a>' : '') +
      '</div>' +
      '<div class="law-body">' + bodyHtml + '</div>' +
    '</div>';
  }

  function renderCompensationStandardsCard() {
    var std = LEGAL_DATA.compensationStandards.liaoning;
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">' + std.province + '赔偿标准（' + std.year + '）</div><span class="badge badge-success">赔偿标准</span></div>';
    html += '<div class="table-wrapper"><table class="table"><thead><tr><th>数据项</th><th>金额</th></tr></thead><tbody>';
    std.data.forEach(function(d) {
      html += '<tr><td>' + escHtml(d.item) + '</td><td style="font-weight:600;">' + d.value.toLocaleString() + ' ' + d.unit + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">' + std.unifiedNote + '</div>';
    html += '</div>';
    return html;
  }

  function renderJudicialTrendsCard() {
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">司法裁判观点变化趋势</div><span class="badge badge-info">裁判观点</span></div>';
    LEGAL_DATA.judicialTrends.forEach(function(cat) {
      html += '<div style="margin-bottom:16px;"><strong style="font-size:14px;">' + escHtml(cat.category) + '</strong>';
      cat.trends.forEach(function(t) {
        html += '<div style="margin-top:8px;padding:8px 12px;background:var(--bg);border-radius:var(--radius-sm);">' +
          '<strong>' + escHtml(t.title) + '</strong>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">' + escHtml(t.desc) + '</div>' +
        '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderTypicalCasesCard() {
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">典型案例分析</div><span class="badge badge-warning">案例</span></div>';
    LEGAL_DATA.typicalCases.forEach(function(c) {
      html += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:var(--radius);">' +
        '<strong>' + escHtml(c.title) + '</strong>' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;"><strong>案情：</strong>' + escHtml(c.facts) + '</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;"><strong>裁判：</strong>' + escHtml(c.ruling) + '</div>' +
        '<div style="font-size:13px;color:var(--success-text);margin-top:4px;"><strong>启示：</strong>' + escHtml(c.insight) + '</div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderDeadlinesRefCard() {
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">常用期限速查</div><span class="badge badge-muted">速查</span></div>';
    html += '<div class="table-wrapper"><table class="table"><thead><tr><th>事项</th><th>期限</th><th>法律依据</th></tr></thead><tbody>';
    LEGAL_DATA.deadlines.forEach(function(d) {
      html += '<tr><td>' + escHtml(d.item) + '</td><td style="font-weight:600;">' + escHtml(d.period) + '</td><td>' + escHtml(d.basis) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function searchLaws(query) {
    var q = query.trim().toLowerCase();
    var cards = document.querySelectorAll('#lawList .law-card');
    if (!q) {
      cards.forEach(function(c) { c.style.display = ''; });
      return;
    }
    cards.forEach(function(c) {
      var text = c.textContent.toLowerCase();
      c.style.display = text.indexOf(q) >= 0 ? '' : 'none';
    });
  }

  function filterLaws(filter, btn) {
    currentLawFilter = filter;
    document.querySelectorAll('#view-laws .filter-tabs .filter-tab').forEach(function(t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderLaws(filter);
  }

  // ===== Compensation Table =====
  function renderCompensationTable() {
    var tbody = document.querySelector('#compTable tbody');
    var html = '';
    LEGAL_DATA.compensationItems.forEach(function(item) {
      html += '<tr><td>' + item.no + '</td><td style="font-weight:600;">' + escHtml(item.name) + '</td><td>' + escHtml(item.formula) + '</td><td style="font-size:13px;color:var(--text-muted);">' + escHtml(item.note) + '</td></tr>';
    });
    tbody.innerHTML = html;
  }

  function renderFeeTable() {
    var tbody = document.getElementById('feeTable');
    var html = '';
    LEGAL_DATA.courtFeeCalc.forEach(function(f) {
      html += '<tr><td>' + escHtml(f.range) + '</td><td><code>' + escHtml(f.formula) + '</code></td></tr>';
    });
    tbody.innerHTML = html;
  }

  function calcCourtFee(value) {
    var amount = parseFloat(value);
    var result = document.getElementById('feeResult');
    if (isNaN(amount) || amount <= 0) { result.textContent = '—'; return; }

    var fee = 0;
    if (amount <= 10000) fee = 50;
    else if (amount <= 100000) fee = amount * 0.025 - 200;
    else if (amount <= 200000) fee = amount * 0.02 + 300;
    else if (amount <= 500000) fee = amount * 0.015 + 1300;
    else if (amount <= 1000000) fee = amount * 0.01 + 3800;
    else if (amount <= 2000000) fee = amount * 0.009 + 4800;
    else if (amount <= 5000000) fee = amount * 0.008 + 6800;
    else if (amount <= 10000000) fee = amount * 0.007 + 11800;
    else if (amount <= 20000000) fee = amount * 0.006 + 21800;
    else fee = amount * 0.005 + 41800;

    result.textContent = Math.max(50, Math.round(fee)).toLocaleString() + ' 元';
  }

  function renderCompStandards() {
    var std = LEGAL_DATA.compensationStandards.liaoning;
    var div = document.getElementById('compStandards');
    var html = '<div class="table-wrapper"><table class="table"><thead><tr><th>数据项</th><th>金额</th></tr></thead><tbody>';
    std.data.forEach(function(d) {
      html += '<tr><td>' + escHtml(d.item) + '</td><td style="font-weight:600;">' + d.value.toLocaleString() + ' ' + d.unit + '</td></tr>';
    });
    html += '</tbody></table></div>';

    // Insurance limits
    html += '<div style="margin-top:16px;"><strong style="font-size:14px;">交强险赔付限额</strong></div>';
    html += '<div class="table-wrapper" style="margin-top:8px;"><table class="table"><thead><tr><th>类别</th><th>有责任限额</th><th>无责任限额</th></tr></thead><tbody>';
    var limits = LEGAL_DATA.insuranceLimits;
    html += '<tr><td>死亡伤残</td><td style="font-weight:600;">' + limits.withLiability.death.toLocaleString() + ' 元</td><td>' + limits.withoutLiability.death.toLocaleString() + ' 元</td></tr>';
    html += '<tr><td>医疗费用</td><td style="font-weight:600;">' + limits.withLiability.medical.toLocaleString() + ' 元</td><td>' + limits.withoutLiability.medical.toLocaleString() + ' 元</td></tr>';
    html += '<tr><td>财产损失</td><td style="font-weight:600;">' + limits.withLiability.property.toLocaleString() + ' 元</td><td>' + limits.withoutLiability.property.toLocaleString() + ' 元</td></tr>';
    html += '<tr style="font-weight:700;"><td>合计</td><td>' + limits.withLiability.total.toLocaleString() + ' 元</td><td>' + limits.withoutLiability.total.toLocaleString() + ' 元</td></tr>';
    html += '</tbody></table></div>';

    div.innerHTML = html;
  }

  // ===== Reports =====
  function refreshReportSelects() {
    var options = '<option value="">— 请选择案件 —</option>';
    cases.forEach(function(c) {
      options += '<option value="' + c.id + '">' + escHtml(c.basicInfo.name || c.id) + ' (' + c.id + ')</option>';
    });
    document.getElementById('reportCaseSelect').innerHTML = options;
    document.getElementById('filingCaseSelect').innerHTML = options;
  }

  function generateReport(type) {
    var selectId = type === 'interview' ? 'reportCaseSelect' : 'filingCaseSelect';
    var caseId = document.getElementById(selectId).value;
    if (!caseId) { alert('请先选择案件'); return; }

    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c) { alert('案件未找到'); return; }

    var outputDiv = document.getElementById('reportOutput');
    var name = c.basicInfo.name || '未知';

    if (type === 'interview') {
      outputDiv.innerHTML = '<div style="padding:20px;background:var(--info-light);border:1px solid var(--info);border-radius:var(--radius);margin-bottom:16px;">' +
        '<strong>接谈分析报告模板已生成</strong><br>' +
        '<span style="font-size:13px;">案件：' + escHtml(name) + ' (' + escHtml(c.id) + ')</span>' +
      '</div>' +
      '<div style="padding:16px;background:var(--bg);border-radius:var(--radius);font-size:14px;line-height:1.8;">' +
        '<p><strong>报告生成说明：</strong></p>' +
        '<p>完整的接谈分析报告需要 QoderWork AI 后端基于以下数据生成：</p>' +
        '<ol style="margin:8px 0 8px 20px;">' +
          '<li>问询单 JSON 数据（已导入）</li>' +
          '<li>操作指引（references/operation-guide.md）</li>' +
          '<li>司法观点（references/judicial-viewpoints.md）</li>' +
          '<li>接谈报告模板（templates/interview-report.md）</li>' +
        '</ol>' +
        '<p>您可以点击下方按钮导出案件数据，然后在 QoderWork 中触发"准备交通事故接谈报告"生成完整报告。</p>' +
        '<div style="margin-top:16px;display:flex;gap:12px;">' +
          '<button class="btn btn-primary" onclick="exportCaseData(\'' + c.id + '\')">&#128229; 导出案件数据</button>' +
          '<button class="btn btn-secondary" onclick="previewTemplate(\'interview\')">&#128065; 预览报告模板</button>' +
        '</div>' +
      '</div>';
    } else {
      outputDiv.innerHTML = '<div style="padding:20px;background:var(--success-light);border:1px solid var(--success);border-radius:var(--radius);margin-bottom:16px;">' +
        '<strong>立案准备指引模板已生成</strong><br>' +
        '<span style="font-size:13px;">案件：' + escHtml(name) + ' (' + escHtml(c.id) + ')</span>' +
      '</div>' +
      '<div style="padding:16px;background:var(--bg);border-radius:var(--radius);font-size:14px;line-height:1.8;">' +
        '<p><strong>立案指引生成说明：</strong></p>' +
        '<p>完整的立案准备指引需要 QoderWork AI 后端生成。您可以：</p>' +
        '<ol style="margin:8px 0 8px 20px;">' +
          '<li>导出案件数据 JSON</li>' +
          '<li>在 QoderWork 中触发"交通事故立案准备"</li>' +
          '<li>系统将自动核查证据、计算赔偿、评估风险</li>' +
        '</ol>' +
        '<div style="margin-top:16px;display:flex;gap:12px;">' +
          '<button class="btn btn-primary" onclick="exportCaseData(\'' + c.id + '\')">&#128229; 导出案件数据</button>' +
          '<button class="btn btn-secondary" onclick="previewTemplate(\'filing\')">&#128065; 预览指引模板</button>' +
        '</div>' +
      '</div>';
    }
  }

  function exportCaseData(caseId) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c) return;
    var blob = new Blob([JSON.stringify(c.source || c, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '案件数据_' + (c.basicInfo.name || caseId) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function previewTemplate(type) {
    var title = type === 'interview' ? '接谈分析报告模板' : '立案准备指引模板';
    var content = type === 'interview' ?
      '<h2>接谈分析报告 — 八大模块</h2><ol><li>案件基本信息</li><li>法律关系分析</li><li>赔偿项目预估</li><li>证据现状评估</li><li>风险评估</li><li>诉讼策略建议</li><li>面谈补充提问清单</li><li>下一步行动</li></ol>' :
      '<h2>立案准备指引 — 六大模块</h2><ol><li>证据完整性核查（21项）</li><li>立案条件评估</li><li>赔偿金额计算</li><li>诉讼风险评估</li><li>立案材料清单</li><li>立案操作指引</li></ol>';

    var modal = document.createElement('div');
    modal.className = 'modal-backdrop active';
    modal.innerHTML = '<div class="modal"><div class="modal-header"><span class="modal-title">' + title + '</span><button class="modal-close" onclick="this.closest(\'.modal-backdrop\').remove()">&#10005;</button></div>' + content + '</div>';
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  // ===== Utilities =====
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== Manual Sync from API =====
  function syncFromAPI() {
    if (!API_ENABLED || !API_BASE_URL) {
      alert('API 未配置，请先设置 API_BASE_URL');
      return;
    }

    fetchSubmissions().then(function(submissions) {
      if (!submissions || submissions.length === 0) {
        alert('API 暂无数据');
        return;
      }

      var newCount = 0;
      submissions.forEach(function(sub) {
        var exists = cases.some(function(c) {
          return c.id === (sub._meta && sub._meta.case_id ? sub._meta.case_id : sub.id);
        });
        if (!exists) {
          importSubmissionToCase(sub);
          newCount++;
        }
      });

      if (newCount > 0) {
        saveCases();
        renderDashboard();
        alert('同步完成：新增 ' + newCount + ' 个案件');
      } else {
        alert('暂无新数据');
      }
    }).catch(function(err) {
      alert('同步失败：' + err.message);
    });
  }

  // ===== Expose to global =====
  window.navigate = navigate;
  window.toggleSidebar = toggleSidebar;
  window.closeSidebar = closeSidebar;
  window.importQuestionnaire = importQuestionnaire;
  window.exportAllData = exportAllData;
  window.clearAllData = clearAllData;
  window.saveTeamConfig = saveTeamConfig;
  window.filterCases = filterCases;
  window.filterDeadlines = filterDeadlines;
  window.filterLaws = filterLaws;
  window.searchLaws = searchLaws;
  window.updateCaseStatus = updateCaseStatus;
  window.deleteCase = deleteCase;
  window.generateReport = generateReport;
  window.exportCaseData = exportCaseData;
  window.previewTemplate = previewTemplate;
  window.calcCourtFee = calcCourtFee;
  window.syncFromAPI = syncFromAPI;

  // ===== Boot =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
