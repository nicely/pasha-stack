const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'blog');
const postsDir = path.join(blogDir, 'posts');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let title = 'Untitled';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      html.push(`<h1>${inlineMarkdown(title)}</h1>`);
      continue;
    }

    if (line.startsWith('## ')) {
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }

    if (line.trim()) {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }

  return { title, body: html.join('\n') };
}

function pageTemplate(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | Neo Evliya Celebi</title>
    <style>
      :root {
        --bg: #20140f;
        --panel: #2b1b14;
        --ink: #f4dfc8;
        --muted: #c89f7a;
        --foam: #f8ead8;
        --border: rgba(246, 214, 178, 0.22);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 15% 10%, rgba(214, 155, 93, 0.18), transparent 24rem),
          linear-gradient(180deg, #160d09 0%, var(--bg) 100%);
        color: var(--ink);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        line-height: 1.75;
      }

      a {
        color: var(--foam);
        text-decoration: none;
      }

      .page {
        width: min(860px, calc(100% - 32px));
        margin: 0 auto;
        padding: 72px 0 36px;
      }

      article {
        border: 1px solid var(--border);
        background: rgba(43, 27, 20, 0.86);
        padding: 30px;
      }

      h1 {
        color: var(--foam);
        font-size: clamp(38px, 7vw, 74px);
        letter-spacing: -0.06em;
        line-height: 1;
        margin-top: 0;
      }

      h2 {
        border-top: 1px solid var(--border);
        color: var(--muted);
        margin-top: 32px;
        padding-top: 20px;
      }

      code {
        background: rgba(139, 94, 60, 0.22);
        color: var(--foam);
        padding: 2px 4px;
      }

      .nav {
        border-top: 1px dashed var(--border);
        color: var(--muted);
        margin-top: 34px;
        padding-top: 18px;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <article>
${body}
        <p class="nav"><a href="/blog/">cd ../blog</a> &nbsp; <a href="/">cd ../home</a></p>
      </article>
    </main>
  </body>
</html>
`;
}

for (const file of fs.readdirSync(postsDir)) {
  if (!file.endsWith('.md')) {
    continue;
  }

  const slug = file.slice(0, -3);

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Post filename must be kebab-case: ${file}`);
  }

  const markdown = fs.readFileSync(path.join(postsDir, file), 'utf8');
  const rendered = renderMarkdown(markdown);
  const outputDir = path.join(blogDir, slug);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), pageTemplate(rendered.title, rendered.body));
  console.log(`Built /blog/${slug}/`);
}
