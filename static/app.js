const API_URL = "/api/tasks";

/* ================= MANAGERS ================= */
const managers = [
  { name: "Waleed Ali", title: "Vice President Commercial", img: "/static/images/waleed.png" },
  { name: "Sultan Darwish", title: "EVP Strategy", img: "/static/images/sultan.png" },
  { name: "Ahmed Alzahri", title: "VP HR", img: "/static/images/ahmed.png" },
  { name: "Loay Almaddah", title: "VP Technical", img: "/static/images/loay.png" },
  { name: "Mohammed Abdulsalam", title: "VP Finance", img: "/static/images/abuamdslam.png" },
  { name: "Mohammad A. Mazi", title: "CEO", img: "/static/images/mazi.png" },
  { name: "Waad R. Binhimd", title: "Corporate Affairs", img: "/static/images/Waad.jpeg" }
];

const MY_USER = "Omar Alamoudi";

/* ================= STATE ================= */
let currentView = "dashboard";
let selectedManager = managers[0].name;
let tasks = [];
let editingIndex = null;
let currentTaskIndex = null;
let exportCsvBtn;
let activeStatusFilter = null; // null = no filter

/* ✅ NEW: flag to avoid re-forcing checkboxes while user interacts */
let ownersInitialized = false;

/* ================= DOM ================= */
let managersRow, managersFooter;
let tasksGrid, completedGrid;
let addBtn, myTasksBtn, backBtn;

let modalBackdrop, modalClose, modalTitle, modalStart, modalDue, modalOwner, modalStatus, modalDesc;
let updateTaskBtn, completeTaskBtn, deleteTaskBtn;

let formBackdrop, formClose, saveTaskBtn;
let taskTitleInput, taskDueInput, taskOwnerChecklist, taskStatusInput, taskDescInput, taskLinkInput;

let kpiTotal, kpiCompleted, kpiProgress, kpiReview, kpiOverdue;

/* charts */
let ownersChartInstance = null;
let statusChartInstance = null;
let upcomingLineChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  bindDOM();
  bindEvents();
  loadTasks();
});

document.querySelectorAll(".kpi-card[data-status]").forEach(card => {
  card.addEventListener("click", () => {
    const status = card.dataset.status;

    // toggle
    if (activeStatusFilter === status) {
      activeStatusFilter = null;
      card.classList.remove("active-filter");
    } else {
      activeStatusFilter = status;

      // remove highlight from others
      document
        .querySelectorAll(".kpi-card")
        .forEach(c => c.classList.remove("active-filter"));

      card.classList.add("active-filter");
    }

    renderTasks();
  });
});
/* ================= BIND ================= */
function bindDOM() {
  managersRow = document.getElementById("managersRow");
  managersFooter = document.getElementById("managersFooter");

  tasksGrid = document.getElementById("tasksGrid");
  completedGrid = document.getElementById("completedGrid");

  addBtn = document.getElementById("addBtn");
  myTasksBtn = document.getElementById("myTasksBtn");
  backBtn = document.getElementById("backBtn");

  modalBackdrop = document.getElementById("modalBackdrop");
  modalClose = document.getElementById("modalClose");
  modalTitle = document.getElementById("modalTitle");
  modalStart = document.getElementById("modalStart");
  modalDue = document.getElementById("modalDue");
  modalOwner = document.getElementById("modalOwner");
  modalStatus = document.getElementById("modalStatus");
  modalDesc = document.getElementById("modalDesc");

  updateTaskBtn = document.getElementById("updateTaskBtn");
  completeTaskBtn = document.getElementById("completeTaskBtn");
  deleteTaskBtn = document.getElementById("deleteTaskBtn");

  formBackdrop = document.getElementById("formBackdrop");
  formClose = document.getElementById("formClose");
  saveTaskBtn = document.getElementById("saveTaskBtn");

  taskTitleInput = document.getElementById("taskTitleInput");
  taskDueInput = document.getElementById("taskDueInput");

  // ✅ must exist in HTML as <div id="taskOwnerChecklist" class="owner-checklist"></div>
  taskOwnerChecklist = document.getElementById("taskOwnerChecklist");

  taskStatusInput = document.getElementById("taskStatusInput");
  taskDescInput = document.getElementById("taskDescInput");
  taskLinkInput = document.getElementById("taskLinkInput");

  kpiTotal = document.getElementById("kpiTotal");
  kpiCompleted = document.getElementById("kpiCompleted");
  kpiProgress = document.getElementById("kpiProgress");
  kpiReview = document.getElementById("kpiReview");
  kpiOverdue = document.getElementById("kpiOverdue");
  exportCsvBtn = document.getElementById("exportCsvBtn");
}

function bindEvents() {
  addBtn.onclick = () => openForm();
  myTasksBtn.onclick = switchToMyView;
  backBtn.onclick = switchToDashboardView;

  modalClose.onclick = () => (modalBackdrop.style.display = "none");
  modalBackdrop.onclick = e => e.target === modalBackdrop && (modalBackdrop.style.display = "none");

  // ✅ close form + reset flag
  formClose.onclick = () => {
    formBackdrop.style.display = "none";
    ownersInitialized = false;
  };
  formBackdrop.onclick = e => {
    if (e.target === formBackdrop) {
      formBackdrop.style.display = "none";
      ownersInitialized = false;
    }
  };

  saveTaskBtn.onclick = saveTask;
  updateTaskBtn.onclick = () => openForm(tasks[currentTaskIndex], currentTaskIndex);
  completeTaskBtn.onclick = toggleComplete;
  deleteTaskBtn.onclick = deleteTask;
  exportCsvBtn.onclick = exportMyTasksToCSV;
}

/* ================= HELPERS ================= */
function toISODate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

/* ================= API ================= */
async function loadTasks() {
  const res = await fetch(API_URL);
  const data = await res.json();
  tasks = Array.isArray(data.tasks) ? data.tasks : [];
  renderAll();
}

async function addTaskAPI(task) {
  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });
  await loadTasks();
}

async function updateTaskAPI(task, index) {
  await fetch(`${API_URL}/${index}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });
  await loadTasks();
}

async function deleteTaskAPI(index) {
  await fetch(`${API_URL}/${index}`, { method: "DELETE" });
  await loadTasks();
}

/* ================= STATS ================= */
function getStatsForOwner(owner) {
  const today = new Date().toISOString().split("T")[0];
  const list = tasks.filter(t => Array.isArray(t.owner) && t.owner.includes(owner));

  return {
    total: list.length,
    completed: list.filter(t => t.status === "Completed").length,
    inProgress: list.filter(t => t.status === "In Progress").length,
    underReview: list.filter(t => t.status === "Under Review").length,
    overdue: list.filter(t => t.status !== "Completed" && t.due && toISODate(t.due) < today).length
  };
}

function getGlobalStats() {
  const today = new Date().toISOString().split("T")[0];
  let stats = { total:0, completed:0, inProgress:0, underReview:0, overdue:0 };

  tasks.forEach(t => {
    const owners = Array.isArray(t.owner) ? t.owner : [t.owner];
    stats.total += owners.length;

    owners.forEach(() => {
      if (t.status === "Completed") stats.completed++;
      if (t.status === "In Progress") stats.inProgress++;
      if (t.status === "Under Review") stats.underReview++;
      if (t.status !== "Completed" && t.due && toISODate(t.due) < today) stats.overdue++;
    });
  });

  return stats;
}

function getTasksPerOwner() {
  const counts = {};
  tasks.forEach(t => {
    const owners = Array.isArray(t.owner) ? t.owner : [t.owner];
    owners.forEach(o => counts[o] = (counts[o] || 0) + 1);
  });
  return counts;
}

function getStatusPerOwner() {
  const today = new Date().toISOString().split("T")[0];
  const result = {};

  tasks.forEach(t => {
    const owners = Array.isArray(t.owner) ? t.owner : [t.owner];

    owners.forEach(o => {
      if (!result[o]) result[o] = { inProgress: 0, overdue: 0 };

      if (t.status === "In Progress") result[o].inProgress++;
      if (t.status !== "Completed" && t.due && toISODate(t.due) < today) result[o].overdue++;
    });
  });

  return result;
}

function exportMyTasksToCSV() {
  const owner = MY_USER;

  const filteredTasks = tasks.filter(
    t => Array.isArray(t.owner) && t.owner.includes(owner)
  );

  if (filteredTasks.length === 0) {
    alert("No tasks to export");
    return;
  }

  const headers = [
    "Title",
    "Start Date",
    "Due Date",
    "Status",
    "Owners",
    "Description",
    "Link"
  ];

  const rows = filteredTasks.map(t => [
    `"${t.title || ""}"`,
    `"${t.startDate || ""}"`,
    `"${t.due || ""}"`,
    `"${t.status || ""}"`,
    `"${(t.owner || []).join(", ")}"`,
    `"${(t.description || "").replace(/"/g, '""')}"`,
    `"${t.link || ""}"`
  ]);

  const csvContent =
    headers.join(",") + "\n" +
    rows.map(r => r.join(",")).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `my_tasks_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

/* ================= CHARTS ================= */
function renderOwnersChart() {
  const data = getTasksPerOwner();
  const labels = Object.keys(data);
  const values = Object.values(data);

  const canvas = document.getElementById("ownersChart");
  if (!canvas) return;

  if (ownersChartInstance) ownersChartInstance.destroy();

  ownersChartInstance = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Total Tasks", data: values }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

function renderStatusChart() {
  const data = getStatusPerOwner();
  const labels = Object.keys(data);

  const inProgress = labels.map(o => data[o].inProgress);
  const overdue = labels.map(o => data[o].overdue);

  const canvas = document.getElementById("statusChart");
  if (!canvas) return;

  if (statusChartInstance) statusChartInstance.destroy();

  statusChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "In Progress",
          data: inProgress,
          backgroundColor: "#3B82F6",   // أزرق هادي
          borderRadius: 6
        },
        {
          label: "Overdue",
          data: overdue,
          backgroundColor: "#EF4444",   // أحمر هادي
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}


function getOwnerOverviewData() {
    const today = new Date().toISOString().split("T")[0];
    const result = {};
  
    tasks.forEach(t => {
      const owners = Array.isArray(t.owner) ? t.owner : [t.owner];
  
      owners.forEach(o => {
        if (!result[o]) {
          result[o] = {
            planned: 0,
            inProgress: 0,
            review: 0,
            completed: 0,
            overdue: 0
          };
        }
  
        if (t.status === "Planned") result[o].planned++;
        if (t.status === "In Progress") result[o].inProgress++;
        if (t.status === "Under Review") result[o].review++;
        if (t.status === "Completed") result[o].completed++;
  
        if (
          t.status !== "Completed" &&
          t.due &&
          toISODate(t.due) < today
        ) {
          result[o].overdue++;
        }
      });
    });
  
    return result;
  }
  
  let ownersOverviewChartInstance = null;
  
  function renderOwnersOverviewChart() {
    const data = getOwnerOverviewData();
    const labels = Object.keys(data);
  
    const planned = labels.map(o => data[o].planned);
    const inProgress = labels.map(o => data[o].inProgress);
    const review = labels.map(o => data[o].review);
    const completed = labels.map(o => data[o].completed);
    const overdue = labels.map(o => data[o].overdue);
  
    const canvas = document.getElementById("ownersOverviewChart");
    if (!canvas) return;
  
    if (ownersOverviewChartInstance) {
      ownersOverviewChartInstance.destroy();
    }
  
    ownersOverviewChartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Planned",
          data: planned,
          backgroundColor: "rgba(148,163,184,0.35)",
          borderColor: "#94A3B8",
          borderWidth: 2,
          borderRadius: 6},
          {  label: "In Progress",
          data: inProgress,
          backgroundColor: "rgba(59,130,246,0.35)",
          borderColor: "#3B82F6",
          borderWidth: 2,
          borderRadius: 6},
          {  label: "Under Review",
          data: review ,
          backgroundColor: "rgba(167,139,250,0.35)",
          borderColor: "#A78BFA",
          borderWidth: 2,
          borderRadius: 6 },
          {  label: "Completed",
          data: completed,
          backgroundColor: "rgba(34,197,94,0.35)",
          borderColor: "#22C55E",
          borderWidth: 2,
          borderRadius: 6 },
          {  label: "Overdue",
          data: overdue,
          backgroundColor: "rgba(239,68,68,0.35)",
          borderColor: "#EF4444",
          borderWidth: 2,
          borderRadius: 6}
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        },
        plugins: {
          legend: { position: "top" }
        }
      }
    });
  }

  function getUpcomingTasksByWeek(weeksAhead = 10) {
    const today = new Date();
    today.setHours(0,0,0,0);
  
    // بداية الأسبوع (Monday)
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const diff = (day === 0 ? -6 : 1) - day; 
    startOfWeek.setDate(startOfWeek.getDate() + diff);
  
    const labels = [];
    const counts = [];
    const details = {};
  
    for (let i = 0; i < weeksAhead; i++) {
      const weekStart = new Date(startOfWeek);
      weekStart.setDate(startOfWeek.getDate() + i * 7);
  
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
  
      const monthName = weekStart.toLocaleString("en-US", { month: "short" });
      const weekNumberInMonth = Math.ceil(
        (weekStart.getDate() + weekStart.getDay()) / 7
      );

const label = `${monthName} - Week ${weekNumberInMonth}`;
      labels.push(label);
  
      details[label] = [];
  
      tasks.forEach(t => {
        if (!t.due || t.status === "Completed") return;
  
        const dueDate = new Date(toISODate(t.due));
        dueDate.setHours(0,0,0,0);
  
        if (dueDate >= weekStart && dueDate <= weekEnd) {
          details[label].push(t);
        }
      });
  
      counts.push(details[label].length);
    }
  
    return { labels, counts, details };
  }

  function renderUpcomingLineChart() {
    const data = getUpcomingTasksByWeek(10);
    const canvas = document.getElementById("upcomingLineChart");
    if (!canvas) return;
  
    if (upcomingLineChartInstance) upcomingLineChartInstance.destroy();
  
    upcomingLineChartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [{
          label: "Tasks per Week",
          data: data.counts,
          borderColor: "#507A49",
          backgroundColor: "rgba(80,122,73,0.2)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const week = ctx.label;
                const list = data.details[week] || [];
  
                return list.map(t =>
                  `• ${t.title} (${(t.owner || []).join(", ")})`
                );
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }

/* ================= RENDER ================= */
function renderAll() {
  renderManagers();
  renderTasks();
  renderKPI();
}

function renderManagers() {
  if (currentView === "my") {
    managersFooter.style.display = "none";
    return;
  }

  managersFooter.style.display = "block";
  managersRow.innerHTML = "";

  managers.forEach(m => {
    const s = getStatsForOwner(m.name);
    const card = document.createElement("div");
    card.className = "manager-card" + (m.name === selectedManager ? " active" : "");

    card.innerHTML = `
      <img class="manager-avatar" src="${m.img}">
      <div class="manager-name">${m.name}</div>
      <div class="manager-title">${m.title}</div>
      <div class="manager-stats-grid">
        <div class="stat-box all"><span class="stat-num">${s.total}</span><span class="stat-label">All</span></div>
        <div class="stat-box progress"><span class="stat-num">${s.inProgress}</span><span class="stat-label">Prog</span></div>
        <div class="stat-box review"><span class="stat-num">${s.underReview}</span><span class="stat-label">Rev</span></div>
        <div class="stat-box overdue"><span class="stat-num">${s.overdue}</span><span class="stat-label">Overdue</span></div>
      </div>
    `;

    card.onclick = () => {
      selectedManager = m.name;
      renderAll();
    };

    managersRow.appendChild(card);
  });
}

function renderTasks() {
  tasksGrid.innerHTML = "";
  completedGrid.innerHTML = "";

  const owner = currentView === "my" ? MY_USER : selectedManager;
  const today = new Date().toISOString().split("T")[0];

  tasks.forEach((t, i) => {
    if (!Array.isArray(t.owner) || !t.owner.includes(owner)) return;

// ✅ status filter
    if (activeStatusFilter && t.status !== activeStatusFilter) return;

    const card = document.createElement("div");
    card.className = "task-card";
    if (t.status !== "Completed" && t.due && toISODate(t.due) < today) card.classList.add("overdue");

    card.innerHTML = `
      <div class="status-badge">${t.status}</div>
      <div class="task-title">${t.title}</div>
      <div class="task-meta">Start: ${t.startDate || "-"}</div>
      <div class="task-meta">Due: ${toISODate(t.due) || "-"}</div>
      <div class="task-meta">Owner: ${(t.owner || []).join(", ")}</div>
    `;

    card.onclick = () => openViewModal(t, i);

    t.status === "Completed" ? completedGrid.appendChild(card) : tasksGrid.appendChild(card);
  });
}

function renderKPI() {
  const s = currentView === "my" ? getGlobalStats() : getStatsForOwner(selectedManager);
  kpiTotal.textContent = s.total;
  kpiCompleted.textContent = s.completed;
  kpiProgress.textContent = s.inProgress;
  kpiReview.textContent = s.underReview;
  kpiOverdue.textContent = s.overdue;
}

/* ================= MODALS ================= */
function openViewModal(task, index) {
  currentTaskIndex = index;
  modalBackdrop.style.display = "flex";

  modalTitle.textContent = task.title;
  modalStart.textContent = "Start: " + (task.startDate || "-");
  modalDue.textContent = "Due: " + (toISODate(task.due) || "-");
  modalOwner.textContent = "Owner: " + (task.owner || []).join(", ");
  modalStatus.textContent = "Status: " + task.status;

  modalDesc.innerHTML = `
    ${task.description || ""}<br>
    ${task.link ? `<a href="${task.link}" target="_blank">Open link</a>` : ""}
  `;

  completeTaskBtn.innerHTML =
    task.status === "Completed"
      ? `<i class="fas fa-rotate-left"></i> Reopen`
      : `<i class="fas fa-check-circle"></i> Complete`;
}

/* ✅ UPDATED: openForm (allow add/remove freely) */
function openForm(task = null, index = null) {
  formBackdrop.style.display = "flex";
  editingIndex = index;

  const owners = [...managers.map(m => m.name), MY_USER];

  // ✅ Build checklist only once per open
  if (!ownersInitialized) {
    taskOwnerChecklist.innerHTML = "";

    owners.forEach(name => {
      let checked = false;

      if (task) {
        checked = Array.isArray(task.owner) && task.owner.includes(name);
      } else {
        // default checks (only at first open)
        if (name === MY_USER) checked = true;
        if (name === selectedManager) checked = true;
      }

      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox" value="${name}" ${checked ? "checked" : ""}>
        ${name}
      `;
      taskOwnerChecklist.appendChild(label);
    });

    ownersInitialized = true;
  }

  if (task) {
    taskTitleInput.value = task.title || "";
    taskDueInput.value = toISODate(task.due);
    taskStatusInput.value = task.status || "Planned";
    taskDescInput.value = task.description || "";
    taskLinkInput.value = task.link || "";
  } else {
    taskTitleInput.value = "";
    taskDueInput.value = "";
    taskStatusInput.value = "Planned";
    taskDescInput.value = "";
    taskLinkInput.value = "";
  }
}

/* ================= SAVE / ACTIONS ================= */
function saveTask() {
  const owners = [...taskOwnerChecklist.querySelectorAll("input:checked")]
    .map(i => i.value);

  if (!taskTitleInput.value.trim() || owners.length === 0) {
    alert("اختاري شخص واحد على الأقل");
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  const task = {
    title: taskTitleInput.value.trim(),
    startDate: editingIndex !== null ? tasks[editingIndex].startDate : today,
    due: toISODate(taskDueInput.value),
    owner: owners,
    status: taskStatusInput.value,
    description: taskDescInput.value,
    link: taskLinkInput.value
  };

  editingIndex !== null ? updateTaskAPI(task, editingIndex) : addTaskAPI(task);

  formBackdrop.style.display = "none";
  ownersInitialized = false; // ✅ reset for next open
}

function toggleComplete() {
  const t = tasks[currentTaskIndex];
  updateTaskAPI(
    { ...t, status: t.status === "Completed" ? "In Progress" : "Completed" },
    currentTaskIndex
  );
  modalBackdrop.style.display = "none";
}

function deleteTask() {
  deleteTaskAPI(currentTaskIndex);
  modalBackdrop.style.display = "none";
}

/* ================= VIEW ================= */
function switchToMyView() {
  currentView = "my";
  selectedManager = MY_USER;

  backBtn.style.display = "block";
  exportCsvBtn.style.display = "flex";
  managersFooter.style.display = "none";
  document.getElementById("myAnalytics").style.display = "block";

  renderTasks();
  renderKPI();

  renderOwnersOverviewChart();
  renderUpcomingLineChart();
}

function switchToDashboardView() {
  currentView = "dashboard";
  selectedManager = managers[0].name;

  backBtn.style.display = "none";
  managersFooter.style.display = "block";
  exportCsvBtn.style.display = "none";
  document.getElementById("myAnalytics").style.display = "none";

  renderAll();
}