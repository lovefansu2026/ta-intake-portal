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
  var caseSearchQuery = '';
  var deadlineSearchQuery = '';

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
      insurance: submission.sections ? (submission.sections.insurance || {}) : {},
      deadlines: submission.deadline_reminders || [],
      demands: submission.sections ? submission.sections.demands : {},
      litigation: submission.sections ? submission.sections.litigation : {},
      materials: submission.sections ? submission.sections.materials : {},
      team: { market_contact: '', consulting_lawyer: '', filing_lawyer: '', representing_lawyer: '' },
      appraisal: {
        disability_appraisal_status: '', // 伤残鉴定状态: 申请/重新申请/不申请
        disability_level: '',
        disability_date: '',
        disability_institution: '',
        nursing_appraisal_status: '', // 护理鉴定状态: 申请/重新申请/不申请
        three_periods: '',
        three_periods_date: '',
        three_periods_institution: '',
        appraisal_notes: ''
      },
      fees: { agency_fee: '', settlement_status: '', settlement_notes: '' }
    };

    // Check for duplicate
    var existing = cases.findIndex(function(c) { return c.id === caseObj.id; });
    if (existing >= 0) {
      caseObj.notes = cases[existing].notes || [];
      caseObj.remarks = cases[existing].remarks || '';
      cases[existing] = Object.assign(cases[existing], caseObj);
    } else {
      caseObj.notes = caseObj.notes || [];
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

    // Event delegation for case cards
    document.getElementById('caseList').addEventListener('click', function(e) {
      var actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        var id = actionBtn.getAttribute('data-id');
        if (actionBtn.getAttribute('data-action') === 'status') updateCaseStatus(id);
        else if (actionBtn.getAttribute('data-action') === 'delete') deleteCase(id);
        return;
      }
      var card = e.target.closest('[data-case-id]');
      if (card) openCaseDetail(card.getAttribute('data-case-id'));
    });

    // Event delegation for deadline board items (verification click)
    document.getElementById('deadlineList').addEventListener('click', function(e) {
      var item = e.target.closest('.deadline-board-item.dv-clickable');
      if (!item) return;
      var caseId = item.getAttribute('data-dv-case');
      var itemName = item.getAttribute('data-dv-item');
      if (!caseId || !itemName) return;
      var c = cases.find(function(x) { return x.id === caseId; });
      if (!c) return;
      var dlIdx = findDeadlineIndex(c, itemName);
      if (dlIdx >= 0) showVerifyPopover(caseId, dlIdx);
    });
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

    // Ensure all deadlines have verification sub-objects (backward compat)
    normalizeAllVerifications();

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
            insurance: data.sections ? (data.sections.insurance || {}) : {},
            deadlines: data.deadline_reminders || [],
            demands: data.sections ? data.sections.demands : {},
            litigation: data.sections ? data.sections.litigation : {},
            materials: data.sections ? data.sections.materials : {},
            // Team members
            team: {
              market_contact: '', // 市场接洽人员
              consulting_lawyer: '', // 谈案律师
              filing_lawyer: '', // 立案律师
              representing_lawyer: '' // 代理律师
            },
            // Appraisal fields
            appraisal: {
              disability_appraisal_status: '', // 伤残鉴定状态: 申请/重新申请/不申请
              disability_level: '',
              disability_date: '',
              disability_institution: '',
              nursing_appraisal_status: '', // 护理鉴定状态: 申请/重新申请/不申请
              three_periods: '',
              three_periods_date: '',
              three_periods_institution: '',
              appraisal_notes: ''
            },
            // Fee fields
            fees: {
              agency_fee: '', // 代理费金额
              settlement_status: '', // 结算状态：未付/部分支付/已付
              settlement_notes: '' // 结算备注
            }
          };

          // Check for duplicate
          var existing = cases.findIndex(function(c) { return c.id === caseObj.id; });
          if (existing >= 0) {
            // Preserve notes and remarks from existing case
            caseObj.notes = cases[existing].notes || [];
            caseObj.remarks = cases[existing].remarks || '';
            cases[existing] = Object.assign(cases[existing], caseObj);
          } else {
            caseObj.notes = caseObj.notes || [];
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
    var filing = cases.filter(function(c) { return c.status === 'filing' || c.status === 'appraisal'; }).length;

    // Count urgent deadlines (exclude verified safe/resolved)
    var urgentCount = 0;
    cases.forEach(function(c) {
      (c.deadlines || []).forEach(function(d) {
        if (d.urgent && getDeadlineVerifyState(d) === 'unverified') urgentCount++;
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
        html += '<div class="case-card" style="cursor:pointer;" data-case-id="' + escHtml(c.id) + '">' +
          '<div class="case-info">' +
            '<div class="case-name">' + escHtml(name) + ' ' + statusBadge + '</div>' +
            '<div class="case-meta"><span>事故：' + escHtml(accidentDate) + '</span><span>责任：' + escHtml(liability) + '</span><span>编号：' + escHtml(c.id) + '</span></div>' +
          '</div>' +
          '<button class="btn btn-sm btn-ghost" data-action="status" data-id="' + escHtml(c.id) + '" title="变更状态" onclick="event.stopPropagation();">&#9998;</button>' +
        '</div>';
      });
      recentDiv.innerHTML = html;

      // Add click delegation for recent cases
      recentDiv.onclick = function(e) {
        var actionBtn = e.target.closest('[data-action]');
        if (actionBtn) { updateCaseStatus(actionBtn.getAttribute('data-id')); return; }
        var card = e.target.closest('[data-case-id]');
        if (card) openCaseDetail(card.getAttribute('data-case-id'));
      };
    }

    // Recent deadlines
    var recentDl = document.getElementById('recentDeadlines');
    var allDeadlines = [];
    cases.forEach(function(c) {
      (c.deadlines || []).forEach(function(d) {
        normalizeDeadlineVerification(d);
        allDeadlines.push(Object.assign({}, d, { caseId: c.id, caseName: c.basicInfo.name || c.id }));
      });
    });
    // Sort: unverified urgent first, then unverified non-urgent, then verified
    allDeadlines.sort(function(a, b) {
      var aState = getDeadlineVerifyState(a);
      var bState = getDeadlineVerifyState(b);
      var aActive = aState === 'unverified' && a.urgent;
      var bActive = bState === 'unverified' && b.urgent;
      if (aActive !== bActive) return aActive ? -1 : 1;
      var aVerified = aState !== 'unverified';
      var bVerified = bState !== 'unverified';
      if (aVerified !== bVerified) return aVerified ? 1 : -1;
      return (a.deadline || '').localeCompare(b.deadline || '');
    });

    if (allDeadlines.length === 0) {
      recentDl.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-text" style="font-size:13px;">导入案件后自动计算关键期限</div></div>';
    } else {
      var dlHtml = '';
      allDeadlines.slice(0, 5).forEach(function(d) {
        var vState = getDeadlineVerifyState(d);
        var level;
        if (vState === 'safe' || vState === 'resolved') level = 'safe';
        else if (vState === 'overdue') level = 'danger';
        else level = d.urgent ? 'danger' : 'safe';
        var badgeHtml = getVerifyBadgeHtml(d);
        dlHtml += '<div class="deadline-item">' +
          '<div class="dl-indicator ' + level + '"></div>' +
          '<div class="dl-info"><div class="dl-title">' + escHtml(d.item) + ' ' + badgeHtml + '</div><div class="dl-legal">' + escHtml(d.caseName) + ' · ' + escHtml(d.legal_basis || '') + '</div></div>' +
          '<div class="dl-remaining deadline-' + level + '">' + escHtml(d.remaining || '') + '</div>' +
        '</div>';
      });
      recentDl.innerHTML = dlHtml;
    }
  }

  // ===== Case List =====
  function renderCaseList() {
    var filtered = currentFilter === 'all' ? cases : cases.filter(function(c) { return c.status === currentFilter; });

    // Apply search filter
    if (caseSearchQuery) {
      var q = caseSearchQuery.toLowerCase();
      filtered = filtered.filter(function(c) {
        var team = c.team || {};
        var appr = c.appraisal || {};
        var fees = c.fees || {};
        var searchable = [
          c.basicInfo.name, c.basicInfo.phone, c.basicInfo.gender, c.basicInfo.birthdate,
          c.basicInfo.address, c.basicInfo.occupation, c.basicInfo.employer,
          c.id,
          c.accident.date, c.accident.location, c.accident.liability, c.accident.weather,
          c.accident.accident_type,
          c.remarks || '',
          // Team members
          team.market_contact, team.consulting_lawyer, team.filing_lawyer, team.representing_lawyer,
          // Appraisal
          appr.disability_appraisal_status, appr.nursing_appraisal_status,
          appr.disability_level, appr.disability_institution, appr.three_periods, appr.three_periods_institution,
          appr.appraisal_notes,
          // Fees
          fees.agency_fee, fees.settlement_status, fees.settlement_notes
        ];
        // Search injury persons
        if (c.injury_persons) {
          c.injury_persons.forEach(function(p) {
            searchable.push(p.name, p.diagnosis, p.hospital, p.death_cause, p.injury_part);
          });
        }
        return searchable.some(function(s) { return s && String(s).toLowerCase().indexOf(q) >= 0; });
      });
    }

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

      html += '<div class="case-card" style="cursor:pointer;" data-case-id="' + escHtml(c.id) + '">' +
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
        '<div style="display:flex;gap:4px;" onclick="event.stopPropagation();">' +
          '<button class="btn btn-sm btn-ghost" data-action="status" data-id="' + escHtml(c.id) + '" title="变更状态">&#9998;</button>' +
          '<button class="btn btn-sm btn-ghost" data-action="delete" data-id="' + escHtml(c.id) + '" title="删除">&#128465;</button>' +
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
    if (c.status === 'appraisal') p = Math.max(p, 70);
    if (c.status === 'trial') p = Math.max(p, 80);
    if (c.status === 'closed') p = 100;
    return Math.min(p, 100);
  }

  function getStatusBadge(status) {
    var map = {
      intake: '<span class="badge badge-warning">接谈中</span>',
      filing: '<span class="badge badge-primary">已立案</span>',
      appraisal: '<span class="badge" style="background:#e0f2f1;color:#00695c;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:500;">鉴定中</span>',
      trial: '<span class="badge badge-info">庭审中</span>',
      closed: '<span class="badge badge-success">已结案</span>'
    };
    return map[status] || '<span class="badge badge-muted">未知</span>';
  }

  function updateCaseStatus(caseId) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c) return;
    var statuses = ['intake', 'filing', 'appraisal', 'trial', 'closed'];
    var labels = ['接谈中', '已立案', '鉴定中', '庭审中', '已结案'];
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

  // ===== Case Detail View =====
  var currentCaseId = null;

  function openCaseDetail(caseId) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c) return;
    currentCaseId = caseId;

    var name = c.basicInfo.name || '未知';
    document.getElementById('caseDetailTitle').textContent = name + ' — 案件详情';

    var html = '';

    // Status & progress
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
      '<div>' + getStatusBadge(c.status) + ' <span style="font-size:13px;color:var(--text-muted);margin-left:8px;">编号：' + escHtml(c.id) + '</span></div>' +
      '<button class="btn btn-sm btn-primary" onclick="updateCaseStatus(\'' + c.id + '\');openCaseDetail(\'' + c.id + '\');">变更状态</button>' +
    '</div>';

    // Basic info
    html += '<div style="margin-bottom:20px;">';
    html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">当事人信息</h4>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
    html += '<div><span style="color:var(--text-muted);">姓名：</span>' + escHtml(c.basicInfo.name || '—') + '</div>';
    html += '<div><span style="color:var(--text-muted);">电话：</span>' + escHtml(c.basicInfo.phone || '—') + '</div>';
    html += '<div><span style="color:var(--text-muted);">性别：</span>' + escHtml(c.basicInfo.gender || '—') + '</div>';
    html += '<div><span style="color:var(--text-muted);">出生日期：</span>' + escHtml(c.basicInfo.birthdate || '—') + '</div>';
    html += '</div></div>';

    // Accident info
    html += '<div style="margin-bottom:20px;">';
    html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">事故信息</h4>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
    html += '<div><span style="color:var(--text-muted);">事故日期：</span>' + escHtml(c.accident.date || '—') + '</div>';
    html += '<div><span style="color:var(--text-muted);">事故地点：</span>' + escHtml(c.accident.location || '—') + '</div>';
    html += '<div><span style="color:var(--text-muted);">责任认定：</span>' + escHtml(c.accident.liability || '—') + '</div>';
    html += '<div><span style="color:var(--text-muted);">事故形态：</span>' + escHtml(c.accident.type || '—') + '</div>';
    html += '</div></div>';

    // Injury persons
    if (c.injury_persons && c.injury_persons.length > 0) {
      html += '<div style="margin-bottom:20px;">';
      html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">伤亡人员</h4>';
      c.injury_persons.forEach(function(p, i) {
        html += '<div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:8px;font-size:13px;">';
        html += '<div style="font-weight:600;margin-bottom:6px;">' + escHtml(p.person_type || '受伤') + (p.name ? ' — ' + escHtml(p.name) : '') + (p.age ? ' (' + p.age + '岁)' : '') + '</div>';
        if (p.person_type === '死亡') {
          html += '<div><span style="color:var(--text-muted);">死亡原因：</span>' + escHtml(p.death_cause || '—') + '</div>';
          html += '<div><span style="color:var(--text-muted);">死亡日期：</span>' + escHtml(p.death_date || '—') + '</div>';
        } else {
          html += '<div><span style="color:var(--text-muted);">诊断：</span>' + escHtml(p.diagnosis || '—') + '</div>';
          html += '<div><span style="color:var(--text-muted);">就诊医院：</span>' + escHtml(p.hospital || '—') + '</div>';
          if (p.hospitalized) html += '<div><span style="color:var(--text-muted);">住院：</span>' + escHtml(p.hosp_start || '') + ' 至 ' + escHtml(p.hosp_end || '—') + '（' + escHtml(p.hosp_days || '—') + '天）</div>';
          if (p.disability_level) html += '<div><span style="color:var(--text-muted);">伤残等级：</span>' + escHtml(p.disability_level) + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // Insurance
    if (c.insurance) {
      html += '<div style="margin-bottom:20px;">';
      html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">保险信息</h4>';
      if (c.insurance.own_types && c.insurance.own_types.length > 0) {
        html += '<div style="font-size:13px;margin-bottom:6px;"><span style="color:var(--text-muted);">己方险种：</span>' + escHtml(c.insurance.own_types.join('、')) + (c.insurance.own_unclear ? ' <span style="color:var(--text-muted);">（可能还有其他险种）</span>' : '') + '</div>';
      }
      if (c.insurance.opposite_types && c.insurance.opposite_types.length > 0) {
        html += '<div style="font-size:13px;margin-bottom:6px;"><span style="color:var(--text-muted);">对方险种：</span>' + escHtml(c.insurance.opposite_types.join('、')) + (c.insurance.opposite_unclear ? ' <span style="color:var(--text-muted);">（可能还有其他险种）</span>' : '') + '</div>';
      }
      if (c.insurance.insurer) html += '<div style="font-size:13px;"><span style="color:var(--text-muted);">己方保险公司：</span>' + escHtml(c.insurance.insurer) + '</div>';
      if (c.insurance.opposite_insurer) html += '<div style="font-size:13px;"><span style="color:var(--text-muted);">对方保险公司：</span>' + escHtml(c.insurance.opposite_insurer) + '</div>';
      html += '</div>';
    }

    // Deadlines — mini board inside case detail
    if (c.deadlines && c.deadlines.length > 0) {
      var urgentDls = c.deadlines.filter(function(d) { return d.urgent && getDeadlineVerifyState(d) === 'unverified'; });
      html += '<div style="margin-bottom:20px;">';
      html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">' +
        '&#9200; 期限看板' +
        (urgentDls.length > 0 ? ' <span style="background:var(--danger-light);color:var(--danger-text);font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px;font-weight:500;">' + urgentDls.length + ' 项紧急</span>' : '') +
        '</h4>';
      // Sort: urgent first
      var sortedDls = c.deadlines.slice().sort(function(a, b) {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return (a.deadline || '').localeCompare(b.deadline || '');
      });
      sortedDls.forEach(function(d, dlIdx) {
        normalizeDeadlineVerification(d);
        var vState = getDeadlineVerifyState(d);
        var hasTolling = hasTollingMitigation(d);

        // Determine bar color based on verification state
        var barColor;
        if (vState === 'safe') barColor = 'var(--success)';
        else if (vState === 'overdue' && !hasTolling) barColor = 'var(--danger)';
        else if (vState === 'overdue' && hasTolling) barColor = 'var(--warning)';
        else if (vState === 'resolved') barColor = '#9e9e9e';
        else barColor = d.urgent ? 'var(--danger)' : 'var(--success)';

        var badgeHtml = getVerifyBadgeHtml(d);
        var clickAttr = ' style="cursor:pointer;" onclick="showVerifyPopover(\'' + escHtml(c.id) + '\',' + dlIdx + ')"';

        html += '<div' + clickAttr + '>';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;margin-bottom:4px;background:var(--bg);border-left:3px solid ' + barColor + ';' +
          (vState === 'resolved' ? 'opacity:0.7;' : '') + '">';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);' +
          (vState === 'resolved' ? 'text-decoration:line-through;color:var(--text-muted);' : '') + '">' +
          escHtml(d.item) + ' ' + badgeHtml + '</div>';
        if (d.legal_basis || d.note) {
          html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + escHtml(d.legal_basis || '') + (d.note ? ' · ' + escHtml(d.note) : '') + '</div>';
        }
        html += '</div>';
        html += '<div style="text-align:right;flex-shrink:0;">';
        if (vState === 'safe') {
          html += '<div style="font-size:11px;font-weight:600;color:var(--success);">&#10003; 已核实</div>';
        } else if (vState === 'overdue' && !hasTolling) {
          html += '<div style="font-size:11px;font-weight:600;color:var(--danger);">逾期' + (d.verification.overdue_days || 0) + '天</div>';
        } else if (vState === 'resolved') {
          html += '<div style="font-size:11px;color:var(--text-muted);">已处理</div>';
        } else {
          html += '<div style="font-size:12px;font-weight:600;color:var(--' + (d.urgent ? 'danger' : 'success') + ');">' + escHtml(d.remaining || '') + '</div>';
        }
        html += '<div style="font-size:11px;color:var(--text-muted);">' + escHtml(d.deadline || '') + '</div>';
        html += '</div>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    // Team members
    var team = c.team || {};
    if (team.market_contact || team.consulting_lawyer || team.filing_lawyer || team.representing_lawyer) {
      html += '<div style="margin-bottom:20px;">';
      html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">团队人员</h4>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
      if (team.market_contact) html += '<div><span style="color:var(--text-muted);">市场接洽人员：</span>' + escHtml(team.market_contact) + '</div>';
      if (team.consulting_lawyer) html += '<div><span style="color:var(--text-muted);">谈案律师：</span>' + escHtml(team.consulting_lawyer) + '</div>';
      if (team.filing_lawyer) html += '<div><span style="color:var(--text-muted);">立案律师：</span>' + escHtml(team.filing_lawyer) + '</div>';
      if (team.representing_lawyer) html += '<div><span style="color:var(--text-muted);">代理律师：</span>' + escHtml(team.representing_lawyer) + '</div>';
      html += '</div></div>';
    }

    // Appraisal info — judicial appraisal status control panel
    var appr = c.appraisal || {};
    var dStatus = appr.disability_appraisal_status || '';
    var nStatus = appr.nursing_appraisal_status || '';
    var hasApprSection = dStatus || nStatus || appr.disability_level || appr.three_periods || appr.appraisal_notes;
    if (hasApprSection) {
      html += '<div style="margin-bottom:20px;">';
      html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">申请司法鉴定状态栏</h4>';

      // Status overview badges
      html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">';
      var dStatusBadge = dStatus ? (dStatus === '不申请' ? '<span style="background:#f5f5f5;color:#999;padding:2px 10px;border-radius:10px;font-size:12px;">不申请</span>' :
        dStatus === '申请' ? '<span style="background:#e0f2f1;color:#00695c;padding:2px 10px;border-radius:10px;font-size:12px;">申请</span>' :
        '<span style="background:#fff3e0;color:#e65100;padding:2px 10px;border-radius:10px;font-size:12px;">重新申请</span>') : '<span style="color:#bbb;font-size:12px;">未设置</span>';
      var nStatusBadge = nStatus ? (nStatus === '不申请' ? '<span style="background:#f5f5f5;color:#999;padding:2px 10px;border-radius:10px;font-size:12px;">不申请</span>' :
        nStatus === '申请' ? '<span style="background:#e0f2f1;color:#00695c;padding:2px 10px;border-radius:10px;font-size:12px;">申请</span>' :
        '<span style="background:#fff3e0;color:#e65100;padding:2px 10px;border-radius:10px;font-size:12px;">重新申请</span>') : '<span style="color:#bbb;font-size:12px;">未设置</span>';
      html += '<div style="font-size:13px;"><span style="color:var(--text-muted);">伤残鉴定：</span>' + dStatusBadge + '</div>';
      html += '<div style="font-size:13px;"><span style="color:var(--text-muted);">护理鉴定：</span>' + nStatusBadge + '</div>';
      html += '</div>';

      // Disability appraisal details (shown when status is 申请 or 重新申请)
      if (dStatus && dStatus !== '不申请') {
        html += '<div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:8px;border-left:3px solid #00695c;">';
        html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">伤残鉴定详情</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
        if (appr.disability_level) html += '<div><span style="color:var(--text-muted);">伤残等级：</span>' + escHtml(appr.disability_level) + '</div>';
        if (appr.disability_date) html += '<div><span style="color:var(--text-muted);">鉴定日期：</span>' + escHtml(appr.disability_date) + '</div>';
        if (appr.disability_institution) html += '<div><span style="color:var(--text-muted);">鉴定机构：</span>' + escHtml(appr.disability_institution) + '</div>';
        if (!appr.disability_level && !appr.disability_date && !appr.disability_institution) {
          html += '<div style="grid-column:1/-1;color:var(--text-muted);font-size:12px;">暂无详情，请在编辑中补充</div>';
        }
        html += '</div></div>';
      }

      // Nursing appraisal details (shown when status is 申请 or 重新申请)
      if (nStatus && nStatus !== '不申请') {
        html += '<div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:8px;border-left:3px solid #0891b2;">';
        html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">护理鉴定（三期鉴定）详情</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
        if (appr.three_periods) html += '<div style="grid-column:1/-1;"><span style="color:var(--text-muted);">三期结果：</span>' + escHtml(appr.three_periods) + '</div>';
        if (appr.three_periods_date) html += '<div><span style="color:var(--text-muted);">鉴定日期：</span>' + escHtml(appr.three_periods_date) + '</div>';
        if (appr.three_periods_institution) html += '<div><span style="color:var(--text-muted);">鉴定机构：</span>' + escHtml(appr.three_periods_institution) + '</div>';
        if (!appr.three_periods && !appr.three_periods_date && !appr.three_periods_institution) {
          html += '<div style="grid-column:1/-1;color:var(--text-muted);font-size:12px;">暂无详情，请在编辑中补充</div>';
        }
        html += '</div></div>';
      }

      // Notes
      if (appr.appraisal_notes) {
        html += '<div style="font-size:13px;margin-top:4px;"><span style="color:var(--text-muted);">鉴定备注：</span>' + escHtml(appr.appraisal_notes) + '</div>';
      }
      html += '</div>';
    }

    // Fee info
    var fees = c.fees || {};
    if (fees.agency_fee || fees.settlement_status) {
      html += '<div style="margin-bottom:20px;">';
      html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">代理费</h4>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
      if (fees.agency_fee) html += '<div><span style="color:var(--text-muted);">代理费金额：</span><strong>' + escHtml(fees.agency_fee) + ' 元</strong></div>';
      if (fees.settlement_status) {
        var statusColor = fees.settlement_status === '已付' ? '#2d7a4c' : fees.settlement_status === '部分支付' ? '#b8860b' : '#c0534d';
        html += '<div><span style="color:var(--text-muted);">结算状态：</span><span style="color:' + statusColor + ';font-weight:600;">' + escHtml(fees.settlement_status) + '</span></div>';
      }
      if (fees.settlement_notes) html += '<div style="grid-column:1/-1;"><span style="color:var(--text-muted);">结算备注：</span>' + escHtml(fees.settlement_notes) + '</div>';
      html += '</div></div>';
    }

    // Notes / follow-up records
    html += '<div style="margin-bottom:20px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:10px;">';
    html += '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin:0;">跟进记录</h4>';
    html += '<button class="btn btn-sm btn-primary" onclick="showQuickNoteForm()" title="添加跟进记录" style="font-size:16px;width:28px;height:28px;padding:0;line-height:1;border-radius:50%;">+</button>';
    html += '</div>';
    // Quick note form (hidden by default)
    html += '<div id="quickNoteForm" style="display:none;background:var(--bg);border-radius:8px;padding:14px;margin-bottom:12px;border:1px solid var(--border);">';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">';
    html += '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px;">事件</label><input type="text" id="qnEvent" placeholder="面谈 / 电话 / 补充证据…" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface);color:var(--text-primary);"></div>';
    html += '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px;">发生时间</label><input type="datetime-local" id="qnOccurTime" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface);color:var(--text-primary);"></div>';
    html += '</div>';
    html += '<div style="margin-bottom:10px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px;">详情</label><textarea id="qnDetails" placeholder="记录要点…" style="width:100%;min-height:60px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px;resize:vertical;background:var(--surface);color:var(--text-primary);"></textarea></div>';
    html += '<div style="margin-bottom:10px;"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px;">下一步待办</label><input type="text" id="qnNextTodo" placeholder="准备起诉状 / 联系保险…" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface);color:var(--text-primary);"></div>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button class="btn btn-sm btn-primary" onclick="saveQuickNote()">保存记录</button>';
    html += '<button class="btn btn-sm btn-ghost" onclick="hideQuickNoteForm()">取消</button>';
    html += '</div></div>';
    // Notes list
    if (c.notes && c.notes.length > 0) {
      html += '<div class="notes-list">';
      c.notes.forEach(function(n, idx) {
        var eventLabel = n.event || '';
        var occurTime = n.occur_time || '';
        var details = n.content || n.details || '';
        var nextTodo = n.next_todo || '';
        var recordTime = n.time || '';
        html += '<div class="note-item">';
        html += '<div class="note-item-header">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
        if (eventLabel) {
          html += '<span class="note-event-tag">' + escHtml(eventLabel) + '</span>';
        }
        if (occurTime) {
          html += '<span style="font-size:12px;color:var(--text-muted);">' + escHtml(occurTime) + '</span>';
        }
        html += '</div>';
        html += '<span style="font-size:11px;color:var(--text-muted);">记录于 ' + escHtml(recordTime) + '</span>';
        html += '</div>';
        if (details) {
          html += '<div class="note-details">' + escHtml(details) + '</div>';
        }
        if (nextTodo) {
          html += '<div class="note-todo"><span class="note-todo-label">待办</span>' + escHtml(nextTodo) + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">暂无跟进记录，点击右上角 + 添加</div>';
    }
    html += '</div>';

    document.getElementById('caseDetailContent').innerHTML = html;
    document.getElementById('caseEditPanel').style.display = 'none';
    document.getElementById('caseEditToggle').style.display = '';
    document.getElementById('caseDetailModal').style.display = '';
  }

  function closeCaseDetail() {
    document.getElementById('caseDetailModal').style.display = 'none';
    currentCaseId = null;
  }

  function toggleCaseEdit() {
    var panel = document.getElementById('caseEditPanel');
    var btn = document.getElementById('caseEditToggle');
    if (panel.style.display === 'none') {
      // Build edit form
      var c = cases.find(function(x) { return x.id === currentCaseId; });
      if (!c) return;

      var html = '';
      var inputStyle = 'width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;background:var(--bg);color:var(--text-primary);';
      var labelStyle = 'font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;';
      var team = c.team || {};
      var appr = c.appraisal || {};
      var fees = c.fees || {};

      // Basic fields
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
      html += '<div><label style="' + labelStyle + '">联系电话</label>' +
        '<input type="text" id="editPhone" value="' + escHtml(c.basicInfo.phone || '') + '" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">责任认定</label>' +
        '<select id="editLiability" style="' + inputStyle + '">' +
        '<option value="">—</option>' +
        '<option value="对方全责"' + (c.accident.liability === '对方全责' ? ' selected' : '') + '>对方全责</option>' +
        '<option value="己方全责"' + (c.accident.liability === '己方全责' ? ' selected' : '') + '>己方全责</option>' +
        '<option value="同等责任"' + (c.accident.liability === '同等责任' ? ' selected' : '') + '>同等责任</option>' +
        '<option value="主次责任"' + (c.accident.liability === '主次责任' ? ' selected' : '') + '>主次责任</option>' +
        '<option value="尚未认定"' + (c.accident.liability === '尚未认定' ? ' selected' : '') + '>尚未认定</option>' +
        '</select></div>';
      html += '</div>';

      // Team members
      html += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:8px;">';
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;">团队人员</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      html += '<div><label style="' + labelStyle + '">市场接洽人员</label><input type="text" id="editMarketContact" value="' + escHtml(team.market_contact || '') + '" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">谈案律师</label><input type="text" id="editConsultingLawyer" value="' + escHtml(team.consulting_lawyer || '') + '" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">立案律师</label><input type="text" id="editFilingLawyer" value="' + escHtml(team.filing_lawyer || '') + '" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">代理律师</label><input type="text" id="editRepresentingLawyer" value="' + escHtml(team.representing_lawyer || '') + '" style="' + inputStyle + '"></div>';
      html += '</div></div>';

      // Appraisal fields — judicial appraisal status control
      html += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:8px;">';
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;">申请司法鉴定状态栏</div>';

      // Disability appraisal status + detail fields
      html += '<div style="margin-bottom:12px;padding:10px;background:var(--surface);border-radius:6px;">';
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
      html += '<span style="font-size:13px;font-weight:500;min-width:70px;">伤残鉴定</span>';
      html += '<select id="editDisabilityStatus" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;background:var(--bg);color:var(--text-primary);" onchange="toggleAppraisalDetail(\'disability\')">';
      html += '<option value=""' + (!appr.disability_appraisal_status ? ' selected' : '') + '>未设置</option>';
      html += '<option value="申请"' + (appr.disability_appraisal_status === '申请' ? ' selected' : '') + '>申请</option>';
      html += '<option value="重新申请"' + (appr.disability_appraisal_status === '重新申请' ? ' selected' : '') + '>重新申请</option>';
      html += '<option value="不申请"' + (appr.disability_appraisal_status === '不申请' ? ' selected' : '') + '>不申请</option>';
      html += '</select></div>';
      html += '<div id="disabilityDetailFields" style="display:' + (appr.disability_appraisal_status && appr.disability_appraisal_status !== '不申请' ? 'block' : 'none') + ';">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      html += '<div><label style="' + labelStyle + '">伤残等级</label><input type="text" id="editDisabilityLevel" value="' + escHtml(appr.disability_level || '') + '" placeholder="例：十级" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">鉴定日期</label><input type="date" id="editDisabilityDate" value="' + escHtml(appr.disability_date || '') + '" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">鉴定机构</label><input type="text" id="editDisabilityInst" value="' + escHtml(appr.disability_institution || '') + '" style="' + inputStyle + '"></div>';
      html += '</div></div>';
      html += '</div>';

      // Nursing appraisal status + detail fields
      html += '<div style="padding:10px;background:var(--surface);border-radius:6px;">';
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
      html += '<span style="font-size:13px;font-weight:500;min-width:70px;">护理鉴定</span>';
      html += '<select id="editNursingStatus" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;background:var(--bg);color:var(--text-primary);" onchange="toggleAppraisalDetail(\'nursing\')">';
      html += '<option value=""' + (!appr.nursing_appraisal_status ? ' selected' : '') + '>未设置</option>';
      html += '<option value="申请"' + (appr.nursing_appraisal_status === '申请' ? ' selected' : '') + '>申请</option>';
      html += '<option value="重新申请"' + (appr.nursing_appraisal_status === '重新申请' ? ' selected' : '') + '>重新申请</option>';
      html += '<option value="不申请"' + (appr.nursing_appraisal_status === '不申请' ? ' selected' : '') + '>不申请</option>';
      html += '</select></div>';
      html += '<div id="nursingDetailFields" style="display:' + (appr.nursing_appraisal_status && appr.nursing_appraisal_status !== '不申请' ? 'block' : 'none') + ';">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      html += '<div><label style="' + labelStyle + '">三期鉴定（误工/护理/营养期）</label><input type="text" id="editThreePeriods" value="' + escHtml(appr.three_periods || '') + '" placeholder="例：误工120日/护理60日/营养60日" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">鉴定日期</label><input type="date" id="editThreePeriodsDate" value="' + escHtml(appr.three_periods_date || '') + '" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">鉴定机构</label><input type="text" id="editThreePeriodsInst" value="' + escHtml(appr.three_periods_institution || '') + '" style="' + inputStyle + '"></div>';
      html += '</div></div>';
      html += '</div>';

      html += '<div style="margin-top:10px;"><label style="' + labelStyle + '">鉴定备注</label><textarea id="editApprNotes" placeholder="鉴定相关补充说明..." style="' + inputStyle + 'min-height:50px;font-family:inherit;resize:vertical;">' + escHtml(appr.appraisal_notes || '') + '</textarea></div>';
      html += '</div>';

      // Fee fields
      html += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:8px;">';
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;">代理费</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
      html += '<div><label style="' + labelStyle + '">代理费金额（元）</label><input type="number" id="editAgencyFee" value="' + escHtml(fees.agency_fee || '') + '" placeholder="例：10000" style="' + inputStyle + '"></div>';
      html += '<div><label style="' + labelStyle + '">结算状态</label>' +
        '<select id="editSettlementStatus" style="' + inputStyle + '">' +
        '<option value="">—</option>' +
        '<option value="未付"' + (fees.settlement_status === '未付' ? ' selected' : '') + '>未付</option>' +
        '<option value="部分支付"' + (fees.settlement_status === '部分支付' ? ' selected' : '') + '>部分支付</option>' +
        '<option value="已付"' + (fees.settlement_status === '已付' ? ' selected' : '') + '>已付</option>' +
        '</select></div>';
      html += '</div>';
      html += '<div style="margin-top:10px;"><label style="' + labelStyle + '">结算备注</label><textarea id="editSettlementNotes" placeholder="结算相关补充说明..." style="' + inputStyle + 'min-height:50px;font-family:inherit;resize:vertical;">' + escHtml(fees.settlement_notes || '') + '</textarea></div>';
      html += '</div>';

      // Remarks
      html += '<div style="margin-bottom:16px;">' +
        '<label style="' + labelStyle + '">备注（诉讼状态、特殊情况等）</label>' +
        '<textarea id="editNotes" placeholder="补充案件备注信息..." style="' + inputStyle + 'min-height:60px;font-family:inherit;resize:vertical;">' + escHtml(c.remarks || '') + '</textarea>' +
      '</div>';

      document.getElementById('caseEditForm').innerHTML = html;
      panel.style.display = '';
      btn.textContent = '✕ 取消编辑';
    } else {
      panel.style.display = 'none';
      btn.textContent = '✎ 编辑';
    }
  }

  // ===== Toggle Appraisal Detail Fields =====
  function toggleAppraisalDetail(type) {
    if (type === 'disability') {
      var sel = document.getElementById('editDisabilityStatus');
      var fields = document.getElementById('disabilityDetailFields');
      if (sel && fields) {
        fields.style.display = (sel.value && sel.value !== '不申请') ? 'block' : 'none';
      }
    } else if (type === 'nursing') {
      var sel = document.getElementById('editNursingStatus');
      var fields = document.getElementById('nursingDetailFields');
      if (sel && fields) {
        fields.style.display = (sel.value && sel.value !== '不申请') ? 'block' : 'none';
      }
    }
  }

  function saveCaseEdit() {
    var c = cases.find(function(x) { return x.id === currentCaseId; });
    if (!c) return;

    // Update editable fields
    var phone = document.getElementById('editPhone');
    var liability = document.getElementById('editLiability');
    var remarks = document.getElementById('editNotes');
    if (phone) c.basicInfo.phone = phone.value.trim();
    if (liability) c.accident.liability = liability.value;
    if (remarks) c.remarks = remarks.value.trim();

    // Save team members
    if (!c.team) c.team = {};
    var el;
    el = document.getElementById('editMarketContact'); if (el) c.team.market_contact = el.value.trim();
    el = document.getElementById('editConsultingLawyer'); if (el) c.team.consulting_lawyer = el.value.trim();
    el = document.getElementById('editFilingLawyer'); if (el) c.team.filing_lawyer = el.value.trim();
    el = document.getElementById('editRepresentingLawyer'); if (el) c.team.representing_lawyer = el.value.trim();

    // Save appraisal fields
    if (!c.appraisal) c.appraisal = {};
    el = document.getElementById('editDisabilityStatus'); if (el) c.appraisal.disability_appraisal_status = el.value;
    el = document.getElementById('editNursingStatus'); if (el) c.appraisal.nursing_appraisal_status = el.value;
    el = document.getElementById('editDisabilityLevel'); if (el) c.appraisal.disability_level = el.value.trim();
    el = document.getElementById('editDisabilityDate'); if (el) c.appraisal.disability_date = el.value.trim();
    el = document.getElementById('editDisabilityInst'); if (el) c.appraisal.disability_institution = el.value.trim();
    el = document.getElementById('editThreePeriods'); if (el) c.appraisal.three_periods = el.value.trim();
    el = document.getElementById('editThreePeriodsDate'); if (el) c.appraisal.three_periods_date = el.value.trim();
    el = document.getElementById('editThreePeriodsInst'); if (el) c.appraisal.three_periods_institution = el.value.trim();
    el = document.getElementById('editApprNotes'); if (el) c.appraisal.appraisal_notes = el.value.trim();

    // Save fee fields
    if (!c.fees) c.fees = {};
    el = document.getElementById('editAgencyFee'); if (el) c.fees.agency_fee = el.value.trim();
    el = document.getElementById('editSettlementStatus'); if (el) c.fees.settlement_status = el.value;
    el = document.getElementById('editSettlementNotes'); if (el) c.fees.settlement_notes = el.value.trim();

    // Add note if entered — structured format
    var noteEvent = document.getElementById('noteEvent');
    var noteDetails = document.getElementById('noteDetails');
    var noteOccurTime = document.getElementById('noteOccurTime');
    var noteNextTodo = document.getElementById('noteNextTodo');
    // Also check legacy textarea
    var noteInput = document.getElementById('caseNoteInput');

    var hasStructured = noteEvent && noteEvent.value.trim();
    var hasLegacy = noteInput && noteInput.value.trim();

    if (hasStructured || hasLegacy) {
      if (!c.notes) c.notes = [];
      var noteObj = {
        time: new Date().toLocaleString('zh-CN'),
        event: noteEvent ? noteEvent.value.trim() : '',
        occur_time: noteOccurTime ? noteOccurTime.value.replace('T', ' ') : '',
        details: noteDetails ? noteDetails.value.trim() : '',
        next_todo: noteNextTodo ? noteNextTodo.value.trim() : '',
        content: hasLegacy ? noteInput.value.trim() : (noteDetails ? noteDetails.value.trim() : '')
      };
      c.notes.unshift(noteObj);
    }

    saveCases();
    renderDashboard();
    renderCaseList();
    openCaseDetail(currentCaseId);
    alert('已保存');
  }

  // Quick note form (opened from case detail view without full edit mode)
  function showQuickNoteForm() {
    var form = document.getElementById('quickNoteForm');
    if (form) {
      form.style.display = 'block';
      // Auto-fill current time for occurrence time
      var now = new Date();
      var pad = function(n) { return n < 10 ? '0' + n : n; };
      var dtVal = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
      var occurEl = document.getElementById('qnOccurTime');
      if (occurEl) occurEl.value = dtVal;
    }
  }

  function hideQuickNoteForm() {
    var form = document.getElementById('quickNoteForm');
    if (form) form.style.display = 'none';
  }

  function saveQuickNote() {
    var eventEl = document.getElementById('qnEvent');
    var detailsEl = document.getElementById('qnDetails');
    var occurEl = document.getElementById('qnOccurTime');
    var todoEl = document.getElementById('qnNextTodo');

    var eventVal = eventEl ? eventEl.value.trim() : '';
    var detailsVal = detailsEl ? detailsEl.value.trim() : '';
    var occurVal = occurEl ? occurEl.value.replace('T', ' ') : '';
    var todoVal = todoEl ? todoEl.value.trim() : '';

    if (!eventVal && !detailsVal) {
      alert('请至少填写事件或详情');
      return;
    }

    var c = cases.find(function(x) { return x.id === currentCaseId; });
    if (!c) return;
    if (!c.notes) c.notes = [];

    c.notes.unshift({
      time: new Date().toLocaleString('zh-CN'),
      event: eventVal,
      occur_time: occurVal,
      details: detailsVal,
      next_todo: todoVal,
      content: detailsVal || eventVal
    });

    saveCases();
    renderDashboard();
    renderCaseList();
    openCaseDetail(currentCaseId);
  }

  // ===== Deadline Board (按案件归集看板) =====
  function renderDeadlineList() {
    // Build case-grouped deadline data
    var caseGroups = {};
    cases.forEach(function(c) {
      var dls = c.deadlines || [];
      if (dls.length === 0) return;

      // Apply urgency filter — verified safe/resolved items are no longer "urgent"
      var filteredDls = dls;
      if (currentDeadlineFilter === 'danger') {
        filteredDls = dls.filter(function(d) {
          return d.urgent && getDeadlineVerifyState(d) === 'unverified';
        });
      } else if (currentDeadlineFilter === 'warn') {
        filteredDls = dls.filter(function(d) { return !d.urgent && d.remaining && d.remaining.indexOf('剩余') >= 0; });
      } else if (currentDeadlineFilter === 'safe') {
        filteredDls = dls.filter(function(d) {
          var vs = getDeadlineVerifyState(d);
          return vs === 'safe' || vs === 'resolved' || (!d.urgent && (!d.remaining || d.remaining.indexOf('剩余') < 0));
        });
      }

      // Apply search filter
      if (deadlineSearchQuery) {
        var q = deadlineSearchQuery.toLowerCase();
        var nameMatch = (c.basicInfo.name || '').toLowerCase().indexOf(q) >= 0;
        var idMatch = (c.id || '').toLowerCase().indexOf(q) >= 0;
        if (!nameMatch && !idMatch) return;
      }

      if (filteredDls.length === 0) return;

      var urgentCount = filteredDls.filter(function(d) {
        return d.urgent && getDeadlineVerifyState(d) === 'unverified';
      }).length;
      caseGroups[c.id] = {
        caseId: c.id,
        caseName: c.basicInfo.name || c.id,
        status: c.status,
        deadlines: filteredDls,
        urgentCount: urgentCount
      };
    });

    var listDiv = document.getElementById('deadlineList');
    var groupKeys = Object.keys(caseGroups);

    if (groupKeys.length === 0) {
      listDiv.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9200;</div><div class="empty-text">暂无期限数据</div></div>';
      return;
    }

    // Sort cases: most urgent deadlines first
    groupKeys.sort(function(a, b) {
      return caseGroups[b].urgentCount - caseGroups[a].urgentCount ||
        caseGroups[a].caseName.localeCompare(caseGroups[b].caseName);
    });

    var html = '';
    groupKeys.forEach(function(caseId) {
      var grp = caseGroups[caseId];
      var statusBadge = getStatusBadge(grp.status);

      html += '<div class="deadline-case-card">';
      // Header — clickable to open case detail
      html += '<div class="deadline-case-header" onclick="openCaseDetail(\'' + escHtml(caseId) + '\')">';
      html += '<div><div class="deadline-case-name">' + escHtml(grp.caseName) + '</div>';
      html += '<div class="deadline-case-id">' + escHtml(caseId) + ' ' + statusBadge + '</div></div>';
      html += '<div class="deadline-case-count">';
      if (grp.urgentCount > 0) {
        html += '<span class="deadline-count-badge urgent">' + grp.urgentCount + ' 紧急</span>';
      }
      html += '<span class="deadline-count-badge normal">' + grp.deadlines.length + ' 项</span>';
      html += '</div></div>';

      // Body — deadline items
      html += '<div class="deadline-case-body">';
      // Sort deadlines: urgent first, then by deadline date
      grp.deadlines.sort(function(a, b) {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return (a.deadline || '').localeCompare(b.deadline || '');
      });
      grp.deadlines.forEach(function(d) {
        normalizeDeadlineVerification(d);
        var vState = getDeadlineVerifyState(d);
        var hasTolling = hasTollingMitigation(d);

        // Determine visual level based on verification state
        var level;
        var stateClass = '';
        if (vState === 'safe') {
          level = 'safe';
          stateClass = ' dv-verified-safe';
        } else if (vState === 'overdue' && !hasTolling) {
          level = 'danger';
          stateClass = ' dv-verified-overdue';
        } else if (vState === 'overdue' && hasTolling) {
          level = 'warn';
          stateClass = ' dv-verified-tolling';
        } else if (vState === 'resolved') {
          level = 'safe';
          stateClass = ' dv-verified-resolved';
        } else {
          // unverified
          level = d.urgent ? 'danger' : 'safe';
        }

        // Build verification badge
        var badgeHtml = getVerifyBadgeHtml(d);

        html += '<div class="deadline-board-item dv-clickable' + stateClass + '" data-dv-case="' + escHtml(caseId) + '" data-dv-item="' + escHtml(d.item) + '">';
        html += '<div class="deadline-board-indicator dl-indicator ' + level + '"></div>';
        html += '<div class="deadline-board-info">';
        html += '<div class="deadline-board-title">' + escHtml(d.item) + ' ' + badgeHtml + '</div>';
        html += '<div class="deadline-board-legal">' + escHtml(d.legal_basis || '') + (d.note ? ' · ' + escHtml(d.note) : '') + '</div>';
        html += '</div>';
        html += '<div class="deadline-board-remaining">';
        if (vState === 'safe') {
          html += '<div style="color:var(--success);font-size:11px;">&#10003; 已核实</div>';
        } else if (vState === 'overdue' && !hasTolling) {
          html += '<div style="color:var(--danger);font-size:11px;">逾期' + (d.verification.overdue_days || 0) + '天</div>';
        } else if (vState === 'resolved') {
          html += '<div style="color:var(--text-muted);font-size:11px;">已处理</div>';
        } else {
          html += '<div class="deadline-' + level + '">' + escHtml(d.remaining || '') + '</div>';
        }
        html += '<div class="deadline-board-deadline">' + escHtml(d.deadline || '') + '</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    });

    listDiv.innerHTML = html;
  }

  function filterDeadlineBoard(query) {
    deadlineSearchQuery = query.trim();
    renderDeadlineList();
  }

  function filterDeadlines(filter, btn) {
    currentDeadlineFilter = filter;
    document.querySelectorAll('#deadlineFilters .filter-tab').forEach(function(t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderDeadlineList();
  }

  // ===== Deadline Verification System =====

  // Backward-compatible: ensure every deadline has a verification sub-object
  function normalizeDeadlineVerification(dl) {
    if (!dl) return dl;
    if (!dl.verification) {
      dl.verification = {
        status: '',           // '' | 'safe' | 'overdue' | 'resolved'
        actual_date: '',      // YYYY-MM-DD
        verified_at: '',      // ISO timestamp
        resolution: '',       // 'personal_applied' | 'personal_submitted'
        resolution_note: '',
        tolling: {
          suspension: false,  // 诉讼时效中止 §194
          interruption: false // 诉讼时效中断 §195
        },
        tolling_note: ''
      };
    }
    if (!dl.verification.tolling) {
      dl.verification.tolling = { suspension: false, interruption: false };
    }
    return dl;
  }

  // Normalize all deadlines in all cases (called on load)
  function normalizeAllVerifications() {
    cases.forEach(function(c) {
      (c.deadlines || []).forEach(normalizeDeadlineVerification);
    });
  }

  // Calculate days between two YYYY-MM-DD dates
  function daysBetween(dateStr1, dateStr2) {
    var d1 = new Date(dateStr1 + 'T00:00:00');
    var d2 = new Date(dateStr2 + 'T00:00:00');
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  // Extract the accident date from a case
  function getAccidentDate(c) {
    return (c.accident && c.accident.date) || '';
  }

  // Verify a deadline item (Flow A: civil litigation / general date verification)
  function verifyDeadline(caseId, dlIndex, actualDate) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c || !c.deadlines || !c.deadlines[dlIndex]) return;

    var dl = c.deadlines[dlIndex];
    normalizeDeadlineVerification(dl);

    var accDate = getAccidentDate(c);
    var deadlineDate = dl.deadline || '';

    // Determine if overdue: compare actual_date against the deadline date
    if (actualDate && deadlineDate) {
      var diff = daysBetween(deadlineDate, actualDate);
      if (diff > 0) {
        // Actual date is after the deadline → overdue
        dl.verification.status = 'overdue';
        dl.verification.overdue_days = diff;
      } else {
        // On time or early
        dl.verification.status = 'safe';
        dl.verification.ahead_days = Math.abs(diff);
      }
    } else if (actualDate) {
      // No deadline date to compare, just mark as safe
      dl.verification.status = 'safe';
    }

    dl.verification.actual_date = actualDate;
    dl.verification.verified_at = new Date().toISOString();

    saveCases();
    return dl.verification;
  }

  // Resolve work injury cascade (Flow B: unit deadline overdue → personal application)
  function resolveWorkInjuryCascade(caseId, dlIndex, resolution, note) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c || !c.deadlines || !c.deadlines[dlIndex]) return;

    var dl = c.deadlines[dlIndex];
    normalizeDeadlineVerification(dl);

    dl.verification.status = 'resolved';
    dl.verification.resolution = resolution; // 'personal_applied' | 'personal_submitted'
    dl.verification.resolution_note = note || '';
    dl.verification.verified_at = new Date().toISOString();

    // Also mark the related personal application deadline as "关联处理"
    var itemName = dl.item || '';
    if (itemName.indexOf('单位申请') >= 0) {
      // Find the personal application deadline
      c.deadlines.forEach(function(d, i) {
        if (i !== dlIndex && d.item && d.item.indexOf('个人申请') >= 0) {
          normalizeDeadlineVerification(d);
          d.verification.status = 'resolved';
          d.verification.resolution = 'linked';
          d.verification.resolution_note = '已由单位申请关联处理';
          d.verification.verified_at = new Date().toISOString();
        }
      });
    }

    saveCases();
    return dl.verification;
  }

  // Set tolling flags (诉讼时效中止/中断)
  function setTollingFlags(caseId, dlIndex, flags, note) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c || !c.deadlines || !c.deadlines[dlIndex]) return;

    var dl = c.deadlines[dlIndex];
    normalizeDeadlineVerification(dl);

    if (flags.suspension !== undefined) dl.verification.tolling.suspension = flags.suspension;
    if (flags.interruption !== undefined) dl.verification.tolling.interruption = flags.interruption;
    if (note !== undefined) dl.verification.tolling_note = note;

    // If any tolling flag is set, status becomes 'resolved' (mitigated)
    if (dl.verification.tolling.suspension || dl.verification.tolling.interruption) {
      dl.verification.status = 'resolved';
    }

    saveCases();
    return dl.verification;
  }

  // Get the display state for a deadline item
  function getDeadlineVerifyState(dl) {
    if (!dl) return 'unverified';
    normalizeDeadlineVerification(dl);
    var v = dl.verification;
    if (!v.status) return 'unverified';
    return v.status; // 'safe' | 'overdue' | 'resolved'
  }

  // Check if a deadline has tolling mitigation
  function hasTollingMitigation(dl) {
    if (!dl || !dl.verification || !dl.verification.tolling) return false;
    return dl.verification.tolling.suspension || dl.verification.tolling.interruption;
  }

  // Get verification badge HTML for a deadline
  function getVerifyBadgeHtml(dl) {
    var state = getDeadlineVerifyState(dl);
    if (state === 'unverified') {
      return '<span class="dv-badge dv-badge-pending">待核实</span>';
    } else if (state === 'safe') {
      return '<span class="dv-badge dv-badge-safe">&#10003; 已核实</span>';
    } else if (state === 'overdue') {
      if (hasTollingMitigation(dl)) {
        var basis = [];
        if (dl.verification.tolling.suspension) basis.push('中止');
        if (dl.verification.tolling.interruption) basis.push('中断');
        return '<span class="dv-badge dv-badge-tolling">&#9888; ' + basis.join('/') + '</span>';
      }
      var days = dl.verification.overdue_days || 0;
      return '<span class="dv-badge dv-badge-overdue">&#10007; 逾期' + days + '天</span>';
    } else if (state === 'resolved') {
      if (dl.verification.resolution === 'linked') {
        return '<span class="dv-badge dv-badge-resolved">&#128279; 关联处理</span>';
      }
      if (dl.verification.resolution === 'personal_applied') {
        return '<span class="dv-badge dv-badge-resolved">&#10003; 已个人申请</span>';
      }
      if (dl.verification.resolution === 'personal_submitted') {
        return '<span class="dv-badge dv-badge-resolved">&#10003; 已提交申请</span>';
      }
      if (dl.verification.resolution === 'accepted') {
        return '<span class="dv-badge dv-badge-resolved">&#10003; 认可认定</span>';
      }
      if (hasTollingMitigation(dl)) {
        var basis2 = [];
        if (dl.verification.tolling.suspension) basis2.push('中止');
        if (dl.verification.tolling.interruption) basis2.push('中断');
        return '<span class="dv-badge dv-badge-tolling">&#9888; ' + basis2.join('/') + '</span>';
      }
      return '<span class="dv-badge dv-badge-resolved">&#10003; 已解决</span>';
    }
    return '';
  }

  // Find the deadline index within a case's deadlines array by item name
  function findDeadlineIndex(c, itemName) {
    if (!c || !c.deadlines) return -1;
    for (var i = 0; i < c.deadlines.length; i++) {
      if (c.deadlines[i].item === itemName) return i;
    }
    return -1;
  }

  // ===== Deadline Verification Popover UI =====

  // Show the verification popover for a specific deadline
  function showVerifyPopover(caseId, dlIndex) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c || !c.deadlines || !c.deadlines[dlIndex]) return;

    var dl = c.deadlines[dlIndex];
    normalizeDeadlineVerification(dl);

    var container = document.getElementById('deadlineVerifyPopover');
    if (!container) return;

    var html = '<div class="dv-popover-backdrop" onclick="if(event.target===this)hideVerifyPopover()">';
    html += '<div class="dv-popover">';
    html += renderPopoverContent(c, dl, dlIndex);
    html += '</div></div>';

    container.innerHTML = html;
    container.style.display = 'block';

    // ESC to close
    document.addEventListener('keydown', _dvEscHandler);
  }

  function _dvEscHandler(e) {
    if (e.key === 'Escape') hideVerifyPopover();
  }

  function hideVerifyPopover() {
    var container = document.getElementById('deadlineVerifyPopover');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    document.removeEventListener('keydown', _dvEscHandler);

    // Re-render to reflect any changes
    renderDeadlineList();
    if (currentCaseId) openCaseDetail(currentCaseId);
  }

  // Render popover content based on deadline type and current state
  function renderPopoverContent(c, dl, dlIndex) {
    var v = dl.verification;
    var itemName = dl.item || '';
    var state = v.status || '';

    var html = '<div class="dv-popover-header">';
    html += '<h4>&#128269; 核实：' + escHtml(itemName) + '</h4>';
    html += '<button class="dv-popover-close" onclick="hideVerifyPopover()">&times;</button>';
    html += '</div>';
    html += '<div class="dv-popover-body">';

    // Info rows
    html += '<div class="dv-info-row"><strong>法定期限：</strong>' + escHtml(dl.deadline || '未设定') +
      (dl.remaining ? '（' + escHtml(dl.remaining) + '）' : '') + '</div>';
    if (dl.legal_basis) {
      html += '<div class="dv-info-row"><strong>法律依据：</strong>' + escHtml(dl.legal_basis) + '</div>';
    }

    // Determine flow type
    var isWorkInjuryUnit = itemName.indexOf('工伤认定') >= 0 && itemName.indexOf('单位') >= 0;
    var isWorkInjuryPersonal = itemName.indexOf('工伤认定') >= 0 && itemName.indexOf('个人') >= 0;
    var isLitigation = itemName.indexOf('民事诉讼') >= 0;
    var isAccidentReview = itemName.indexOf('交通事故认定复核') >= 0;

    // If already verified, show current status first
    if (state === 'safe') {
      html += '<div class="dv-result dv-result-safe">';
      html += '&#10003; 已核实：在法定期限内完成';
      if (v.ahead_days) html += '（提前' + v.ahead_days + '天）';
      if (v.actual_date) html += '<br>实际完成日期：' + escHtml(v.actual_date);
      html += '</div>';
      html += '<div class="dv-popover-actions">';
      html += '<button class="btn btn-ghost" onclick="hideVerifyPopover()">关闭</button>';
      html += '<button class="btn btn-secondary" onclick="resetVerify(\'' + escHtml(c.id) + '\',' + dlIndex + ')">重新核验</button>';
      html += '</div>';
    } else if (state === 'overdue' && !hasTollingMitigation(dl)) {
      html += '<div class="dv-result dv-result-overdue">';
      html += '&#10007; 逾期' + (v.overdue_days || 0) + '天，有诉讼时效届满风险';
      if (v.actual_date) html += '<br>实际完成日期：' + escHtml(v.actual_date);
      html += '</div>';
      // Show tolling options
      html += renderTollingSection(c, dl, dlIndex);
    } else if (state === 'resolved') {
      if (v.resolution === 'linked') {
        html += '<div class="dv-result dv-result-resolved">&#128279; 已关联处理（由单位申请关联）</div>';
      } else if (v.resolution === 'personal_applied') {
        html += '<div class="dv-result dv-result-resolved">&#10003; 已通过个人申请解决</div>';
      } else if (v.resolution === 'personal_submitted') {
        html += '<div class="dv-result dv-result-resolved">&#10003; 个人申请已提交</div>';
      } else if (v.resolution === 'accepted') {
        html += '<div class="dv-result dv-result-resolved">&#10003; 认可认定结果，不申请复核</div>';
      } else if (hasTollingMitigation(dl)) {
        var basis = [];
        if (v.tolling.suspension) basis.push('诉讼时效中止（§194）');
        if (v.tolling.interruption) basis.push('诉讼时效中断（§195）');
        html += '<div class="dv-result dv-result-tolling">&#9888; 存在' + basis.join('、') + '事由</div>';
        if (v.tolling_note) {
          html += '<div class="dv-info-row"><strong>事由说明：</strong>' + escHtml(v.tolling_note) + '</div>';
        }
      } else {
        html += '<div class="dv-result dv-result-resolved">&#10003; 已解决</div>';
      }
      html += '<div class="dv-popover-actions">';
      html += '<button class="btn btn-ghost" onclick="hideVerifyPopover()">关闭</button>';
      html += '<button class="btn btn-secondary" onclick="resetVerify(\'' + escHtml(c.id) + '\',' + dlIndex + ')">重新核验</button>';
      html += '</div>';
    } else {
      // Unverified — show input form
      if (isWorkInjuryUnit) {
        html += renderWorkInjuryUnitForm(c, dl, dlIndex);
      } else if (isAccidentReview) {
        html += renderAccidentReviewForm(c, dl, dlIndex);
      } else {
        html += renderDateVerifyForm(c, dl, dlIndex);
      }
    }

    html += '</div>';
    return html;
  }

  // Flow A: Date verification form (for 提起民事诉讼 and other general deadlines)
  function renderDateVerifyForm(c, dl, dlIndex) {
    var html = '';
    html += '<div style="margin-top:16px;">';
    html += '<label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:4px;">实际完成日期</label>';
    html += '<input class="dv-date-input" type="date" id="dvActualDate" value="">';
    html += '</div>';
    html += '<div class="dv-popover-actions">';
    html += '<button class="btn btn-ghost" onclick="hideVerifyPopover()">取消</button>';
    html += '<button class="btn btn-primary" onclick="handleVerifySubmit(\'' + escHtml(c.id) + '\',' + dlIndex + ')">提交核实</button>';
    html += '</div>';
    return html;
  }

  // Flow B: Work injury unit cascade form
  function renderWorkInjuryUnitForm(c, dl, dlIndex) {
    var html = '';
    var isOverdue = dl.urgent || false;
    if (isOverdue) {
      html += '<div class="dv-result dv-result-overdue" style="margin-top:12px;">';
      html += '&#9888; 单位申请期限已逾期';
      html += '</div>';
    }
    html += '<div style="margin-top:16px;">';
    html += '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px;">请选择处理方式：</label>';
    html += '<div class="dv-cascade-options">';
    html += '<label><input type="radio" name="dvCascade" value="personal_applied"><span>已通过个人申请</span></label>';
    html += '<label><input type="radio" name="dvCascade" value="personal_submitted"><span>个人申请已提交</span></label>';
    html += '</div>';
    html += '<textarea class="dv-tolling-note" id="dvCascadeNote" placeholder="备注说明（可选）"></textarea>';
    html += '</div>';
    html += '<div class="dv-popover-actions">';
    html += '<button class="btn btn-ghost" onclick="hideVerifyPopover()">取消</button>';
    html += '<button class="btn btn-primary" onclick="handleCascadeResolve(\'' + escHtml(c.id) + '\',' + dlIndex + ')">确认</button>';
    html += '</div>';
    return html;
  }

  // Flow C: Accident review — accept result, no review application
  function renderAccidentReviewForm(c, dl, dlIndex) {
    var html = '';
    html += '<div style="margin-top:16px;">';
    html += '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">';
    html += '如认可交通事故认定结果，可确认不申请复核。';
    html += '</div>';
    html += '</div>';
    html += '<div class="dv-popover-actions">';
    html += '<button class="btn btn-ghost" onclick="hideVerifyPopover()">取消</button>';
    html += '<button class="btn btn-primary" onclick="handleAccidentReviewConfirm(\'' + escHtml(c.id) + '\',' + dlIndex + ')">认可认定结果，不申请复核</button>';
    html += '</div>';
    return html;
  }

  // Tolling section (shown when overdue for litigation-type deadlines)
  function renderTollingSection(c, dl, dlIndex) {
    var html = '';
    html += '<div style="margin-top:12px;font-size:13px;color:var(--text-secondary);margin-bottom:8px;">进一步核实有无诉讼时效中止、中断事由：</div>';
    html += '<div class="dv-tolling-group">';
    html += '<label>';
    html += '<input type="checkbox" id="dvTollingSuspension">';
    html += '<div><span>存在诉讼时效中止事由</span>';
    html += '<div class="dv-tolling-legal">《民法典》第194条 — 不可抗力等障碍导致无法行使请求权</div></div>';
    html += '</label>';
    html += '<label>';
    html += '<input type="checkbox" id="dvTollingInterruption">';
    html += '<div><span>存在诉讼时效中断事由</span>';
    html += '<div class="dv-tolling-legal">《民法典》第195条 — 权利人主张权利或义务人同意履行</div></div>';
    html += '</label>';
    html += '</div>';
    html += '<textarea class="dv-tolling-note" id="dvTollingNote" placeholder="事由说明（可选）"></textarea>';
    html += '<div class="dv-popover-actions">';
    html += '<button class="btn btn-ghost" onclick="hideVerifyPopover()">取消</button>';
    html += '<button class="btn btn-primary" onclick="handleTollingSubmit(\'' + escHtml(c.id) + '\',' + dlIndex + ')">确认知悉</button>';
    html += '</div>';
    return html;
  }

  // Handle Flow A: submit date verification
  function handleVerifySubmit(caseId, dlIndex) {
    var dateInput = document.getElementById('dvActualDate');
    if (!dateInput || !dateInput.value) {
      alert('请输入实际完成日期');
      return;
    }

    var result = verifyDeadline(caseId, dlIndex, dateInput.value);
    if (!result) return;

    // Re-render the popover to show result
    showVerifyPopover(caseId, dlIndex);
  }

  // Handle Flow B: resolve work injury cascade
  function handleCascadeResolve(caseId, dlIndex) {
    var radios = document.querySelectorAll('input[name="dvCascade"]');
    var selected = '';
    radios.forEach(function(r) { if (r.checked) selected = r.value; });

    if (!selected) {
      alert('请选择处理方式');
      return;
    }

    var note = '';
    var noteEl = document.getElementById('dvCascadeNote');
    if (noteEl) note = noteEl.value.trim();

    resolveWorkInjuryCascade(caseId, dlIndex, selected, note);
    hideVerifyPopover();
  }

  // Handle Flow C: accept accident review result, no review application
  function handleAccidentReviewConfirm(caseId, dlIndex) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c || !c.deadlines || !c.deadlines[dlIndex]) return;

    var dl = c.deadlines[dlIndex];
    dl.verification.status = 'resolved';
    dl.verification.resolution = 'accepted';
    dl.verification.verified_at = new Date().toISOString();
    dl.urgent = false;

    saveCases();
    hideVerifyPopover();
  }

  // Handle tolling submission
  function handleTollingSubmit(caseId, dlIndex) {
    var suspension = false;
    var interruption = false;
    var suspEl = document.getElementById('dvTollingSuspension');
    var intEl = document.getElementById('dvTollingInterruption');
    if (suspEl) suspension = suspEl.checked;
    if (intEl) interruption = intEl.checked;

    if (!suspension && !interruption) {
      alert('请至少选择一项中止/中断事由，或关闭弹窗');
      return;
    }

    var note = '';
    var noteEl = document.getElementById('dvTollingNote');
    if (noteEl) note = noteEl.value.trim();

    setTollingFlags(caseId, dlIndex, { suspension: suspension, interruption: interruption }, note);
    hideVerifyPopover();
  }

  // Reset verification for a deadline
  function resetVerify(caseId, dlIndex) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c || !c.deadlines || !c.deadlines[dlIndex]) return;

    var dl = c.deadlines[dlIndex];
    dl.verification = {
      status: '',
      actual_date: '',
      verified_at: '',
      resolution: '',
      resolution_note: '',
      tolling: { suspension: false, interruption: false },
      tolling_note: ''
    };
    dl.verification.overdue_days = 0;
    dl.verification.ahead_days = 0;

    saveCases();
    showVerifyPopover(caseId, dlIndex);
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
    if (filter === 'all' || filter === '赔偿标准') {
      html += renderCompensationStandardsCard();
    }
    if (filter === 'all' || filter === '裁判观点') {
      html += renderJudicialTrendsCard();
      html += renderTypicalCasesCard();
    }
    if (filter === 'all' || filter === '证据清单') {
      html += renderEvidenceChecklist();
    }
    if (filter === 'all' || filter === '法律关系') {
      html += renderLegalRelationships();
    }
    if (filter === 'all' || filter === '诉讼策略') {
      html += renderLitigationStrategies();
    }
    if (filter === 'all' || filter === '庭审要点') {
      html += renderTrialPoints();
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

  function renderEvidenceChecklist() {
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">证据收集清单</div><span class="badge badge-info">证据</span></div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">来源：操作指引第二节 — 对照逐项核查证据链完整性</div>';

    LEGAL_DATA.evidenceChecklist.forEach(function(cat) {
      html += '<div style="margin-bottom:16px;"><strong style="font-size:14px;display:block;margin-bottom:8px;">' + escHtml(cat.category) + '</strong>';
      html += '<div class="table-wrapper"><table class="table"><thead><tr><th>证据名称</th><th>证明目的</th><th>获取方式</th><th>备注</th></tr></thead><tbody>';
      cat.items.forEach(function(item) {
        var urgencyColor = '';
        if (item.urgency) {
          urgencyColor = item.urgency.indexOf('紧急') >= 0 ? 'color:var(--danger);font-weight:600;' : '';
        }
        var note = item.note || item.target || '';
        html += '<tr><td style="font-weight:500;">' + escHtml(item.name) + '</td><td>' + escHtml(item.purpose) + '</td><td style="font-size:13px;">' + escHtml(item.source) + '</td><td style="font-size:13px;color:var(--text-muted);">' + escHtml(note) + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    });

    html += '</div>';
    return html;
  }

  function renderLegalRelationships() {
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">法律关系识别</div><span class="badge badge-primary">分析</span></div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">来源：操作指引第一节 — 接案后识别案件涉及的法律关系</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">';

    LEGAL_DATA.legalRelationships.forEach(function(rel) {
      html += '<div style="padding:12px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--primary);">' +
        '<div style="font-weight:600;font-size:14px;margin-bottom:6px;">' + escHtml(rel.type) + '</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">识别要点：' + escHtml(rel.keyPoints) + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">依据：' + escHtml(rel.basis) + '</div>' +
      '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function renderLitigationStrategies() {
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">诉讼策略建议</div><span class="badge badge-warning">策略</span></div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">来源：操作指引第四节 — 被告选择、保险索赔、时效管理、刑事风险</div>';

    LEGAL_DATA.litigationStrategies.forEach(function(strat) {
      html += '<div style="margin-bottom:16px;"><strong style="font-size:14px;display:block;margin-bottom:8px;">' + escHtml(strat.category) + '</strong>';

      if (strat.category === '被告选择策略') {
        html += '<div class="table-wrapper"><table class="table"><thead><tr><th>被告类型</th><th>何时列为被告</th><th>法律依据</th></tr></thead><tbody>';
        strat.items.forEach(function(item) {
          html += '<tr><td style="font-weight:500;">' + escHtml(item.defendant) + '</td><td>' + escHtml(item.when) + '</td><td style="font-size:13px;">' + escHtml(item.basis) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (strat.category === '保险索赔要点') {
        strat.items.forEach(function(item) {
          html += '<div style="margin-bottom:8px;padding:8px 12px;background:var(--bg);border-radius:var(--radius-sm);">' +
            '<strong>' + escHtml(item.point) + '</strong>' +
            '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">' + escHtml(item.desc) + '</div>' +
          '</div>';
        });
      } else if (strat.category === '诉讼时效管理') {
        html += '<div class="table-wrapper"><table class="table"><thead><tr><th>请求权</th><th>时效</th><th>起算点</th><th>依据</th></tr></thead><tbody>';
        strat.items.forEach(function(item) {
          html += '<tr><td style="font-weight:500;">' + escHtml(item.claim) + '</td><td style="font-weight:600;">' + escHtml(item.period) + '</td><td style="font-size:13px;">' + escHtml(item.startPoint) + '</td><td style="font-size:13px;">' + escHtml(item.basis) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (strat.category === '刑事立案标准') {
        html += '<div class="table-wrapper"><table class="table"><thead><tr><th>情形</th><th>立案标准</th><th>量刑</th></tr></thead><tbody>';
        strat.items.forEach(function(item) {
          var sentenceColor = item.sentence.indexOf('7年') >= 0 ? 'color:var(--danger);font-weight:600;' : '';
          html += '<tr><td style="font-weight:500;">' + escHtml(item.situation) + '</td><td style="font-size:13px;">' + escHtml(item.standard) + '</td><td style="font-size:13px;' + sentenceColor + '">' + escHtml(item.sentence) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }

      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderTrialPoints() {
    var html = '<div class="law-card"><div class="law-header"><div class="law-title">庭审要点</div><span class="badge badge-success">庭审</span></div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">来源：操作指引第五节 — 质证、举证、保险审查、庭审流程</div>';

    LEGAL_DATA.trialPoints.forEach(function(section) {
      html += '<div style="margin-bottom:16px;"><strong style="font-size:14px;display:block;margin-bottom:8px;">' + escHtml(section.category) + '</strong>';

      if (section.category === '逐项举证体系') {
        html += '<div class="table-wrapper"><table class="table"><thead><tr><th>赔偿项目</th><th>核心证据</th><th>辅助证据</th></tr></thead><tbody>';
        section.points.forEach(function(p) {
          html += '<tr><td style="font-weight:500;">' + escHtml(p.item) + '</td><td>' + escHtml(p.core) + '</td><td style="font-size:13px;color:var(--text-muted);">' + escHtml(p.auxiliary) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else if (section.category === '庭审全流程') {
        html += '<div style="display:flex;flex-direction:column;gap:4px;">';
        section.points.forEach(function(p) {
          var stepNum = parseInt(p);
          var bgColor = stepNum <= 2 ? 'var(--bg)' : stepNum <= 4 ? 'var(--primary-light)' : stepNum <= 8 ? 'var(--info-light, #e8f4fd)' : stepNum <= 10 ? 'var(--warning-light, #fff8e1)' : 'var(--success-light, #e8f5e9)';
          html += '<div style="padding:6px 12px;background:' + bgColor + ';border-radius:var(--radius-sm);font-size:13px;">' + escHtml(p) + '</div>';
        });
        html += '</div>';
      } else {
        html += '<div style="display:flex;flex-direction:column;gap:6px;">';
        section.points.forEach(function(p) {
          html += '<div style="padding:8px 12px;background:var(--bg);border-radius:var(--radius-sm);font-size:13px;">' + escHtml(p) + '</div>';
        });
        html += '</div>';
      }

      html += '</div>';
    });

    html += '</div>';
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

  // ===== Search Cases =====
  function searchCases(query) {
    caseSearchQuery = query.trim();
    renderCaseList();
  }

  // ===== Print Case Detail =====
  function printCaseDetail() {
    if (!currentCaseId) { alert('请先打开一个案件'); return; }
    var c = cases.find(function(x) { return x.id === currentCaseId; });
    if (!c) return;

    var name = c.basicInfo.name || '未知';
    var printContent = '';
    printContent += '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>案件详情 - ' + escHtml(name) + '</title>';
    printContent += '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#333;font-size:14px;line-height:1.8;}';
    printContent += 'h1{font-size:22px;border-bottom:2px solid #4a8c6f;padding-bottom:8px;color:#4a8c6f;}';
    printContent += 'h2{font-size:16px;color:#555;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;}';
    printContent += '.field{display:inline-block;width:48%;margin-bottom:6px;vertical-align:top;}';
    printContent += '.label{color:#888;font-size:12px;} .value{font-weight:500;}';
    printContent += '.person-card{background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:8px;border-left:3px solid #4a8c6f;}';
    printContent += '.note{background:#f0f7f2;border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:13px;}';
    printContent += '.note-time{color:#888;font-size:11px;} @media print{body{padding:10px;}}</style></head><body>';

    printContent += '<h1>' + escHtml(name) + ' — 案件详情</h1>';
    printContent += '<div style="margin-bottom:8px;color:#888;font-size:13px;">编号：' + escHtml(c.id) + ' &nbsp;|&nbsp; 状态：' + escHtml(c.status) + ' &nbsp;|&nbsp; 导入时间：' + escHtml((c.importTime || '').substring(0, 10)) + '</div>';

    // Basic info
    printContent += '<h2>当事人信息</h2>';
    printContent += '<div class="field"><span class="label">姓名：</span><span class="value">' + escHtml(c.basicInfo.name || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">电话：</span><span class="value">' + escHtml(c.basicInfo.phone || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">性别：</span><span class="value">' + escHtml(c.basicInfo.gender || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">出生日期：</span><span class="value">' + escHtml(c.basicInfo.birthdate || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">身份证号：</span><span class="value">' + escHtml(c.basicInfo.idcard || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">职业：</span><span class="value">' + escHtml(c.basicInfo.occupation || '—') + '</span></div>';
    printContent += '<div class="field" style="width:100%;"><span class="label">地址：</span><span class="value">' + escHtml(c.basicInfo.address || '—') + '</span></div>';

    // Accident info
    printContent += '<h2>事故信息</h2>';
    printContent += '<div class="field"><span class="label">事故日期：</span><span class="value">' + escHtml(c.accident.date || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">事故地点：</span><span class="value">' + escHtml(c.accident.location || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">责任认定：</span><span class="value">' + escHtml(c.accident.liability || '—') + '</span></div>';
    printContent += '<div class="field"><span class="label">事故形态：</span><span class="value">' + escHtml(c.accident.type || c.accident.accident_type || '—') + '</span></div>';

    // Injury persons
    if (c.injury_persons && c.injury_persons.length > 0) {
      printContent += '<h2>伤亡人员</h2>';
      c.injury_persons.forEach(function(p) {
        printContent += '<div class="person-card">';
        printContent += '<strong>' + escHtml(p.person_type || '受伤') + (p.name ? ' — ' + escHtml(p.name) : '') + (p.age ? ' (' + p.age + '岁)' : '') + '</strong><br>';
        if (p.person_type === '死亡') {
          printContent += '<span class="label">死亡原因：</span>' + escHtml(p.death_cause || '—') + '<br>';
          printContent += '<span class="label">死亡日期：</span>' + escHtml(p.death_date || '—');
        } else {
          if (p.diagnosis) printContent += '<span class="label">诊断：</span>' + escHtml(p.diagnosis) + '<br>';
          if (p.hospital) printContent += '<span class="label">医院：</span>' + escHtml(p.hospital) + '<br>';
          if (p.hospitalized) printContent += '<span class="label">住院：</span>' + escHtml(p.hosp_start || '') + ' 至 ' + escHtml(p.hosp_end || '—') + '（' + escHtml(p.hosp_days || '—') + '天）<br>';
          if (p.disability_level) printContent += '<span class="label">伤残等级：</span>' + escHtml(p.disability_level);
        }
        printContent += '</div>';
      });
    }

    // Insurance
    if (c.insurance && (c.insurance.own_types || c.insurance.insurer || c.insurance.opposite_insurer)) {
      printContent += '<h2>保险信息</h2>';
      if (c.insurance.own_types && c.insurance.own_types.length > 0) printContent += '<div><span class="label">己方险种：</span>' + escHtml(c.insurance.own_types.join('、')) + '</div>';
      if (c.insurance.insurer) printContent += '<div><span class="label">己方保险公司：</span>' + escHtml(c.insurance.insurer) + '</div>';
      if (c.insurance.opposite_types && c.insurance.opposite_types.length > 0) printContent += '<div><span class="label">对方险种：</span>' + escHtml(c.insurance.opposite_types.join('、')) + '</div>';
      if (c.insurance.opposite_insurer) printContent += '<div><span class="label">对方保险公司：</span>' + escHtml(c.insurance.opposite_insurer) + '</div>';
    }

    // Deadlines
    if (c.deadlines && c.deadlines.length > 0) {
      printContent += '<h2>关键期限</h2>';
      c.deadlines.forEach(function(d) {
        normalizeDeadlineVerification(d);
        var vState = getDeadlineVerifyState(d);
        var hasTolling = hasTollingMitigation(d);
        var color = '';
        var statusText = '';
        if (vState === 'safe') { color = 'color:#2d7a4c;'; statusText = ' ✓ 已核实'; }
        else if (vState === 'overdue' && !hasTolling) { color = 'color:#c0534d;font-weight:600;'; statusText = ' ✗ 逾期' + (d.verification.overdue_days || 0) + '天'; }
        else if (vState === 'overdue' && hasTolling) { color = 'color:#b8860b;'; statusText = ' ⚠ 中止/中断'; }
        else if (vState === 'resolved') { color = 'color:#888;'; statusText = ' ✓ 已处理'; }
        else if (d.urgent) { color = 'color:#c0534d;font-weight:600;'; }
        printContent += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #ddd;"><span>' + escHtml(d.item) + '<span style="font-size:11px;color:#888;">' + statusText + '</span></span><span style="' + color + '">' + escHtml(d.remaining || '') + ' (' + escHtml(d.deadline || '') + ')</span></div>';
      });
    }

    // Team members (print)
    var pTeam = c.team || {};
    if (pTeam.market_contact || pTeam.consulting_lawyer || pTeam.filing_lawyer || pTeam.representing_lawyer) {
      printContent += '<h2>团队人员</h2>';
      if (pTeam.market_contact) printContent += '<div class="field"><span class="label">市场接洽人员：</span><span class="value">' + escHtml(pTeam.market_contact) + '</span></div>';
      if (pTeam.consulting_lawyer) printContent += '<div class="field"><span class="label">谈案律师：</span><span class="value">' + escHtml(pTeam.consulting_lawyer) + '</span></div>';
      if (pTeam.filing_lawyer) printContent += '<div class="field"><span class="label">立案律师：</span><span class="value">' + escHtml(pTeam.filing_lawyer) + '</span></div>';
      if (pTeam.representing_lawyer) printContent += '<div class="field"><span class="label">代理律师：</span><span class="value">' + escHtml(pTeam.representing_lawyer) + '</span></div>';
    }

    // Appraisal (print) — judicial appraisal status control panel
    var pAppr = c.appraisal || {};
    var pDStatus = pAppr.disability_appraisal_status || '';
    var pNStatus = pAppr.nursing_appraisal_status || '';
    if (pDStatus || pNStatus || pAppr.disability_level || pAppr.three_periods || pAppr.appraisal_notes) {
      printContent += '<h2>申请司法鉴定状态栏</h2>';
      printContent += '<div style="margin-bottom:8px;"><span class="label">伤残鉴定：</span><span class="value">' + (pDStatus || '未设置') + '</span></div>';
      printContent += '<div style="margin-bottom:8px;"><span class="label">护理鉴定：</span><span class="value">' + (pNStatus || '未设置') + '</span></div>';

      if (pDStatus && pDStatus !== '不申请') {
        printContent += '<div style="background:#f0f7f2;border-radius:6px;padding:10px;margin:8px 0;border-left:3px solid #4a8c6f;">';
        printContent += '<strong style="font-size:13px;">伤残鉴定详情</strong><br>';
        if (pAppr.disability_level) printContent += '<div class="field"><span class="label">伤残等级：</span><span class="value">' + escHtml(pAppr.disability_level) + '</span></div>';
        if (pAppr.disability_date) printContent += '<div class="field"><span class="label">鉴定日期：</span><span class="value">' + escHtml(pAppr.disability_date) + '</span></div>';
        if (pAppr.disability_institution) printContent += '<div class="field"><span class="label">鉴定机构：</span><span class="value">' + escHtml(pAppr.disability_institution) + '</span></div>';
        printContent += '</div>';
      }

      if (pNStatus && pNStatus !== '不申请') {
        printContent += '<div style="background:#e8f4fd;border-radius:6px;padding:10px;margin:8px 0;border-left:3px solid #0891b2;">';
        printContent += '<strong style="font-size:13px;">护理鉴定（三期鉴定）详情</strong><br>';
        if (pAppr.three_periods) printContent += '<div class="field" style="width:100%;"><span class="label">三期结果：</span><span class="value">' + escHtml(pAppr.three_periods) + '</span></div>';
        if (pAppr.three_periods_date) printContent += '<div class="field"><span class="label">鉴定日期：</span><span class="value">' + escHtml(pAppr.three_periods_date) + '</span></div>';
        if (pAppr.three_periods_institution) printContent += '<div class="field"><span class="label">鉴定机构：</span><span class="value">' + escHtml(pAppr.three_periods_institution) + '</span></div>';
        printContent += '</div>';
      }

      if (pAppr.appraisal_notes) printContent += '<div class="field" style="width:100%;"><span class="label">鉴定备注：</span>' + escHtml(pAppr.appraisal_notes) + '</div>';
    }

    // Fees (print)
    var pFees = c.fees || {};
    if (pFees.agency_fee || pFees.settlement_status) {
      printContent += '<h2>代理费</h2>';
      if (pFees.agency_fee) printContent += '<div class="field"><span class="label">代理费金额：</span><span class="value" style="font-weight:700;">' + escHtml(pFees.agency_fee) + ' 元</span></div>';
      if (pFees.settlement_status) printContent += '<div class="field"><span class="label">结算状态：</span><span class="value">' + escHtml(pFees.settlement_status) + '</span></div>';
      if (pFees.settlement_notes) printContent += '<div class="field" style="width:100%;"><span class="label">结算备注：</span>' + escHtml(pFees.settlement_notes) + '</div>';
    }

    // Notes
    if (c.notes && c.notes.length > 0) {
      printContent += '<h2>跟进记录</h2>';
      c.notes.forEach(function(n) {
        var eventLabel = n.event || '';
        var occurTime = n.occur_time || '';
        var details = n.content || n.details || '';
        var nextTodo = n.next_todo || '';
        printContent += '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:10px;margin-bottom:8px;">';
        printContent += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
        if (eventLabel) printContent += '<span style="background:#e3f2fd;color:#1565c0;font-size:12px;font-weight:600;padding:2px 8px;border-radius:10px;">' + escHtml(eventLabel) + '</span>';
        if (occurTime) printContent += '<span style="font-size:12px;color:#888;">' + escHtml(occurTime) + '</span>';
        printContent += '</div>';
        printContent += '<div style="font-size:11px;color:#aaa;margin-bottom:4px;">记录于 ' + escHtml(n.time || '') + '</div>';
        if (details) printContent += '<div style="font-size:13px;color:#333;margin-bottom:4px;">' + escHtml(details) + '</div>';
        if (nextTodo) printContent += '<div style="font-size:12px;color:#f57f17;"><strong>待办：</strong>' + escHtml(nextTodo) + '</div>';
        printContent += '</div>';
      });
    }

    if (c.remarks) {
      printContent += '<h2>备注</h2>';
      printContent += '<div>' + escHtml(c.remarks) + '</div>';
    }

    printContent += '<div style="margin-top:30px;text-align:center;color:#aaa;font-size:12px;">打印时间：' + new Date().toLocaleString('zh-CN') + '</div>';
    printContent += '</body></html>';

    var printWin = window.open('', '_blank', 'width=900,height=700');
    printWin.document.write(printContent);
    printWin.document.close();
    printWin.focus();
    setTimeout(function() { printWin.print(); }, 500);
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
  window.openCaseDetail = openCaseDetail;
  window.closeCaseDetail = closeCaseDetail;
  window.toggleCaseEdit = toggleCaseEdit;
  window.saveCaseEdit = saveCaseEdit;
  window.generateReport = generateReport;
  window.exportCaseData = exportCaseData;
  window.previewTemplate = previewTemplate;
  window.calcCourtFee = calcCourtFee;
  window.searchCases = searchCases;
  window.printCaseDetail = printCaseDetail;
  window.toggleAppraisalDetail = toggleAppraisalDetail;
  window.filterDeadlineBoard = filterDeadlineBoard;
  window.renderDeadlineList = renderDeadlineList;
  window.renderDashboard = renderDashboard;
  window.showVerifyPopover = showVerifyPopover;
  window.hideVerifyPopover = hideVerifyPopover;
  window.handleVerifySubmit = handleVerifySubmit;
  window.handleCascadeResolve = handleCascadeResolve;
  window.handleAccidentReviewConfirm = handleAccidentReviewConfirm;
  window.handleTollingSubmit = handleTollingSubmit;
  window.resetVerify = resetVerify;
  window.showQuickNoteForm = showQuickNoteForm;
  window.hideQuickNoteForm = hideQuickNoteForm;
  window.saveQuickNote = saveQuickNote;

  // ===== Boot =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
