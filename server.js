const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TASKS_FILE = path.join(__dirname, 'tasks.md');
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(__dirname, 'images');

// Ensure directories exist
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, generateMD([]), 'utf-8');
}

function parseMD(md) {
    const lines = md.split('\n');
    const tasks = [];
    let currentTask = null;
    let currentPriority = 'Normal';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('## ')) {
            if (line.includes('Urgent')) currentPriority = 'Urgent';
            else if (line.includes('High')) currentPriority = 'High';
            else if (line.includes('Normal')) currentPriority = 'Normal';
        } else if (line.match(/^- \[[ x]\] /)) {
            if (currentTask) tasks.push(currentTask);
            const isDone = line.startsWith('- [x] ');
            let content = line.replace(/^- \[[ x]\] /, '').trim();
            if (content.startsWith('**') && content.endsWith('**')) {
                content = content.substring(2, content.length - 2);
            }
            currentTask = {
                id: Math.random().toString(36).substr(2, 9),
                content: content,
                status: isDone ? 'done' : 'pending',
                priority: currentPriority
            };
        } else if (currentTask && !line.startsWith('## ')) {
            currentTask.content += '\n' + line;
        }
    }
    if (currentTask) tasks.push(currentTask);

    tasks.forEach(t => {
        t.content = (t.content || '').trim();
    });

    return tasks;
}

function generateMD(tasks) {
    let md = `# 📋 Anduril - Agent Task Manager\n\n`;
    md += `> **Agent Instructions:**\n`;
    md += `> 1. ALWAYS read \`.agent/workflows/anduril.md\`, \`.agent/workflows/agent-memory.md\` and \`docs/API_REFERENCE.md\` first.\n`;
    md += `> 2. Read the tasks below.\n`;
    md += `> 3. Process the highest priority pending task.\n`;
    md += `> 4. ALWAYS mark it as done live by changing \`- [ ]\` to \`- [x]\` here.\n`;
    md += `> 5. If a task contains an image link (\`![image](images/...)\`), ALWAYS use your vision/file reading capabilities to view and analyze the image before starting.\n`;
    md += `> 6. You may append any notes or audit logs to the description area under the task.\n\n`;

    const priorities = [
        { key: 'Urgent', title: '🔴 Urgent' },
        { key: 'High', title: '🟡 High' },
        { key: 'Normal', title: '🟢 Normal' }
    ];

    for (let p of priorities) {
        const pTasks = tasks.filter(t => t.priority === p.key);
        md += `## ${p.title}\n`;
        if (pTasks.length === 0) {
            md += `\n`;
            continue;
        }
        for (let t of pTasks) {
            const check = t.status === 'done' ? 'x' : ' ';
            const lines = (t.content || '').split('\n');
            md += `- [${check}] ${lines[0] || ''}\n`;
            if (lines.length > 1) {
                md += lines.slice(1).join('\n') + '\n';
            }
        }
        md += '\n';
    }
    return md.trim() + '\n';
}

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Ext, X-File-Name');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/api/tasks') {
        try {
            const md = fs.readFileSync(TASKS_FILE, 'utf-8');
            const tasks = parseMD(md);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tasks));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        }
    } else if (req.method === 'POST' && req.url === '/api/tasks') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const tasks = JSON.parse(body);
                const md = generateMD(tasks);
                fs.writeFileSync(TASKS_FILE, md, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (req.method === 'POST' && req.url === '/api/upload') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body);
            const ext = req.headers['x-file-ext'] || 'bin';
            const rawName = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : '';
            
            // Clean original filename, keeping only safe alphanumeric characters
            let cleanBaseName = 'upload';
            if (rawName) {
                const parts = rawName.split('.');
                if (parts.length > 1) parts.pop(); // Remove extension
                cleanBaseName = parts.join('.').replace(/[^a-zA-Z0-9_-]/g, '_');
                if (!cleanBaseName) cleanBaseName = 'upload';
            }
            
            const filename = `file_${Date.now()}_${cleanBaseName}.${ext}`;
            fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: `images/${filename}` }));
        });
    } else if (req.method === 'POST' && req.url === '/api/delete-images') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const { filenames } = JSON.parse(body);
                let deleted = 0;
                for (const name of filenames) {
                    // Safety: only allow deleting from images/ dir, no path traversal
                    const safe = path.basename(name);
                    const target = path.join(IMAGES_DIR, safe);
                    if (fs.existsSync(target)) {
                        fs.unlinkSync(target);
                        deleted++;
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ deleted }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        let extname = path.extname(filePath);
        let contentType = 'application/octet-stream';

        switch (extname) {
            case '.html':
            case '':
                contentType = 'text/html';
                break;
            case '.js': contentType = 'text/javascript'; break;
            case '.css': contentType = 'text/css'; break;
            case '.json': contentType = 'application/json'; break;
            case '.png': contentType = 'image/png'; break;
            case '.jpg': contentType = 'image/jpg'; break;
            case '.jpeg': contentType = 'image/jpeg'; break;
            case '.webp': contentType = 'image/webp'; break;
            case '.gif': contentType = 'image/gif'; break;
            case '.svg': contentType = 'image/svg+xml'; break;
            case '.pdf': contentType = 'application/pdf'; break;
            case '.txt': contentType = 'text/plain'; break;
            case '.md': contentType = 'text/markdown'; break;
        }

        let targetDir = PUBLIC_DIR;
        if (req.url.startsWith('/images/')) {
            targetDir = path.dirname(IMAGES_DIR); 
        }

        fs.readFile(path.join(targetDir, filePath), (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('404 Not Found');
                } else {
                    res.writeHead(500);
                    res.end('500 Server Error');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    }
});

server.listen(PORT, () => {
    console.log(`Anduril Agent Task Manager running at http://localhost:${PORT}`);
});
