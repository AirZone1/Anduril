lucide.createIcons();

let tasks = [];
let isSyncing = false;
let editingTaskId = null;

const syncStatus = document.getElementById('syncStatus');
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;
const addTaskBtn = document.getElementById('addTaskBtn');
const taskPriority = document.getElementById('taskPriority');
const taskDescription = document.getElementById('taskDescription');
const attachFileBtn = document.getElementById('attachFileBtn');
const taskFileSelect = document.getElementById('taskFileSelect');
const clearAllDoneBtn = document.getElementById('clearAllDoneBtn');

const savedTheme = localStorage.getItem('agent-tasks-theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('agent-tasks-theme', newTheme);
});

// Initialize collapse states from localStorage
function initCollapseStates() {
    const sections = ['Urgent', 'High', 'Normal', 'Done'];
    sections.forEach(name => {
        const section = document.getElementById(`section-${name}`);
        if (section) {
            const isCollapsed = localStorage.getItem(`anduril-collapsed-${name}`) === 'true';
            if (isCollapsed) {
                section.classList.add('collapsed');
            } else {
                section.classList.remove('collapsed');
            }
        }
    });
}

// Toggle section collapsable state
window.toggleSection = function(name) {
    const section = document.getElementById(`section-${name}`);
    if (!section) return;
    const isCollapsed = section.classList.toggle('collapsed');
    localStorage.setItem(`anduril-collapsed-${name}`, isCollapsed ? 'true' : 'false');
};

// Clear all completed tasks
if (clearAllDoneBtn) {
    clearAllDoneBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Don't trigger collapse
        const doneTasks = tasks.filter(t => t.status === 'done');
        if (doneTasks.length === 0) {
            alert('No completed tasks to clear.');
            return;
        }
        if (!confirm(`Are you sure you want to delete all ${doneTasks.length} completed tasks?`)) return;

        const filenames = [];
        const imgRegex = /!\[.*?\]\(images\/(.*?)\)/g;
        const fileRegex = /\[.*?\]\(images\/(.*?)\)/g;

        doneTasks.forEach(task => {
            if (task.content) {
                let match;
                while ((match = imgRegex.exec(task.content)) !== null) {
                    filenames.push(match[1]);
                }
                while ((match = fileRegex.exec(task.content)) !== null) {
                    filenames.push(match[1]);
                }
            }
        });

        if (filenames.length > 0) {
            try {
                await fetch('/api/delete-images', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filenames })
                });
            } catch (err) {
                console.error('Failed to delete media', err);
            }
        }

        tasks = tasks.filter(t => t.status !== 'done');
        renderTasks();
        await saveTasks();
    });
}

// File Upload Utility
async function uploadFile(file, textarea) {
    const isImage = file.type.startsWith('image/');
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    
    const originalName = file.name || (isImage ? 'image.png' : 'file.bin');
    const ext = originalName.split('.').pop() || (isImage ? 'webp' : 'bin');
    
    const uploadingText = `\n![Uploading ${originalName}...]()\n`;
    
    textarea.value = textarea.value.substring(0, startPos) + 
        uploadingText + 
        textarea.value.substring(endPos);
    
    try {
        let bodyBlob = file;
        let finalExt = ext;
        
        // Optimize images client-side
        if (isImage) {
            try {
                const bitmap = await createImageBitmap(file);
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                canvas.getContext('2d').drawImage(bitmap, 0, 0);
                bodyBlob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.85));
                finalExt = 'webp';
            } catch (err) {
                console.warn('Canvas webp conversion failed, using raw image', err);
            }
        }
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/octet-stream',
                'X-File-Ext': finalExt,
                'X-File-Name': encodeURIComponent(originalName)
            },
            body: bodyBlob
        });
        const data = await response.json();
        
        let replacement;
        if (isImage || finalExt === 'webp') {
            replacement = `\n![${originalName}](${data.url})\n`;
        } else {
            replacement = `\n[📄 ${originalName}](${data.url})\n`;
        }
        textarea.value = textarea.value.replace(uploadingText, replacement);
    } catch (err) {
        console.error('File upload failed', err);
        textarea.value = textarea.value.replace(uploadingText, `\n[Error uploading ${originalName}]\n`);
    }
}

// Drag & Drop Handling
document.addEventListener('dragover', (e) => {
    if (e.target.tagName === 'TEXTAREA') {
        e.preventDefault();
        e.target.classList.add('drag-over');
    }
});
document.addEventListener('dragleave', (e) => {
    if (e.target.tagName === 'TEXTAREA') {
        e.target.classList.remove('drag-over');
    }
});
document.addEventListener('drop', async (e) => {
    if (e.target.tagName === 'TEXTAREA') {
        const textarea = e.target;
        textarea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            e.preventDefault();
            for (let i = 0; i < files.length; i++) {
                await uploadFile(files[i], textarea);
            }
        }
    }
});

// Paste Handling
document.addEventListener('paste', async (e) => {
    if (e.target.tagName !== 'TEXTAREA') return;
    
    const textarea = e.target;
    const cd = e.clipboardData;
    if (!cd) return;

    const files = [];
    if (cd.items) {
        for (let i = 0; i < cd.items.length; i++) {
            const file = cd.items[i].getAsFile();
            if (file) files.push(file);
        }
    }
    if (files.length === 0 && cd.files && cd.files.length > 0) {
        for (let i = 0; i < cd.files.length; i++) {
            files.push(cd.files[i]);
        }
    }

    if (files.length > 0) {
        e.preventDefault();
        for (const file of files) {
            await uploadFile(file, textarea);
        }
    }
});

// Attach File Trigger
if (attachFileBtn && taskFileSelect) {
    attachFileBtn.addEventListener('click', () => {
        taskFileSelect.click();
    });
    taskFileSelect.addEventListener('change', async () => {
        const files = taskFileSelect.files;
        if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                await uploadFile(files[i], taskDescription);
            }
            taskFileSelect.value = ''; // Clear selection
        }
    });
}

async function fetchTasks() {
    if (isSyncing || editingTaskId) return;
    try {
        const res = await fetch('/api/tasks');
        const newTasks = await res.json();
        if (JSON.stringify(newTasks) !== JSON.stringify(tasks)) {
            tasks = newTasks;
            renderTasks();
        }
        setSyncStatus('synced');
    } catch (e) {
        console.error(e);
        setSyncStatus('error');
    }
}

async function saveTasks() {
    isSyncing = true;
    setSyncStatus('syncing');
    try {
        await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tasks)
        });
        setSyncStatus('synced');
    } catch (e) {
        console.error(e);
        setSyncStatus('error');
    }
    isSyncing = false;
}

function setSyncStatus(status) {
    syncStatus.className = 'status-indicator ' + status;
    if (status === 'syncing') {
        syncStatus.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Saving...';
    } else if (status === 'synced') {
        syncStatus.innerHTML = '<i data-lucide="check"></i> Synced';
    } else if (status === 'error') {
        syncStatus.innerHTML = '<i data-lucide="alert-triangle"></i> Connection Error';
    }
    lucide.createIcons();
}

addTaskBtn.addEventListener('click', async () => {
    const desc = taskDescription.value.trim();
    if (!desc) return alert('Please enter a task description.');

    const newTask = {
        id: Math.random().toString(36).substr(2, 9),
        content: desc,
        status: 'pending',
        priority: taskPriority.value
    };

    tasks.unshift(newTask);
    renderTasks();
    await saveTasks();

    taskDescription.value = '';
});

function toggleTaskStatus(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.status = task.status === 'done' ? 'pending' : 'done';
        renderTasks();
        saveTasks();
    }
}

function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    const task = tasks.find(t => t.id === id);
    if (task && task.content) {
        const imgRegex = /!\[.*?\]\(images\/(.*?)\)/g;
        const fileRegex = /\[.*?\]\(images\/(.*?)\)/g;
        const filenames = [];
        let match;
        while ((match = imgRegex.exec(task.content)) !== null) {
            filenames.push(match[1]);
        }
        while ((match = fileRegex.exec(task.content)) !== null) {
            filenames.push(match[1]);
        }
        if (filenames.length > 0) {
            fetch('/api/delete-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filenames })
            }).catch(err => console.error('Failed to delete media', err));
        }
    }
    
    tasks = tasks.filter(t => t.id !== id);
    renderTasks();
    saveTasks();
}

function startEditTask(id) {
    editingTaskId = id;
    renderTasks();
}

function cancelEditTask() {
    editingTaskId = null;
    renderTasks();
}

async function saveEditTask(id, card) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newPriority = card.querySelector('.edit-priority').value;
    const newDesc = card.querySelector('.edit-desc').value.trim();

    if (!newDesc) {
        alert('Task description cannot be empty.');
        return;
    }

    task.priority = newPriority;
    task.content = newDesc;
    
    editingTaskId = null;
    renderTasks();
    await saveTasks();
}

function renderTasks() {
    const lists = {
        'Urgent': document.getElementById('list-Urgent'),
        'High': document.getElementById('list-High'),
        'Normal': document.getElementById('list-Normal'),
        'Done': document.getElementById('list-Done')
    };

    Object.values(lists).forEach(l => l.innerHTML = '');

    // Track pending and total per priority for "pending/total" display
    const pendingCounts = { 'Urgent': 0, 'High': 0, 'Normal': 0 };
    const totalCounts = { 'Urgent': 0, 'High': 0, 'Normal': 0, 'Done': 0 };

    // Pre-count all tasks for accurate totals
    tasks.forEach(task => {
        if (task.status === 'done') {
            totalCounts['Done']++;
        } else {
            totalCounts[task.priority] = (totalCounts[task.priority] || 0) + 1;
            pendingCounts[task.priority] = (pendingCounts[task.priority] || 0) + 1;
        }
    });

    const template = document.getElementById('task-template');

    tasks.forEach(task => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.task-card');
        const viewMode = clone.querySelector('.task-view');
        const editMode = clone.querySelector('.task-edit');
        
        if (task.status === 'done') {
            card.classList.add('done');
        }
        
        const checkbox = clone.querySelector('.task-checkbox');
        checkbox.checked = task.status === 'done';
        checkbox.addEventListener('change', () => toggleTaskStatus(task.id));

        const delBtn = clone.querySelector('.delete-btn');
        delBtn.addEventListener('click', () => deleteTask(task.id));

        const editBtn = clone.querySelector('.edit-btn');
        editBtn.addEventListener('click', () => startEditTask(task.id));

        const bodyEl = clone.querySelector('.task-body');
        const descText = task.content || '';
        
        if (descText && descText.trim() !== '') {
            bodyEl.innerHTML = marked.parse(descText);
        } else {
            bodyEl.style.display = 'none';
        }

        if (editingTaskId === task.id) {
            viewMode.style.display = 'none';
            editMode.style.display = 'block';

            const editPriority = clone.querySelector('.edit-priority');
            const editDesc = clone.querySelector('.edit-desc');
            editPriority.value = task.priority;
            editDesc.value = descText;

            const editFileSelect = clone.querySelector('.edit-file-select');
            const editAttachBtn = clone.querySelector('.edit-attach-btn');
            
            if (editAttachBtn && editFileSelect) {
                editAttachBtn.addEventListener('click', () => editFileSelect.click());
                editFileSelect.addEventListener('change', async () => {
                    const files = editFileSelect.files;
                    if (files && files.length > 0) {
                        for (let i = 0; i < files.length; i++) {
                            await uploadFile(files[i], editDesc);
                        }
                        editFileSelect.value = '';
                    }
                });
            }

            clone.querySelector('.cancel-edit-btn').addEventListener('click', () => cancelEditTask());
            clone.querySelector('.save-edit-btn').addEventListener('click', () => saveEditTask(task.id, card));
        }

        const targetList = task.status === 'done' 
            ? lists['Done'] 
            : (lists[task.priority] || lists['Normal']);
        targetList.appendChild(clone);
    });

    // Update section counts — priority sections show "pending/total", Done shows count
    ['Urgent', 'High', 'Normal'].forEach(key => {
        const countEl = document.getElementById(`count-${key}`);
        if (countEl) {
            const pending = pendingCounts[key] || 0;
            const total = totalCounts[key] || 0;
            countEl.textContent = `(${pending}/${total})`;
        }
    });
    const doneCountEl = document.getElementById('count-Done');
    if (doneCountEl) {
        doneCountEl.textContent = `(${totalCounts['Done']})`;
    }

    lucide.createIcons();
}

// Initial loads
initCollapseStates();
fetchTasks();
setInterval(fetchTasks, 3000);
